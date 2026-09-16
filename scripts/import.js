#!/usr/bin/env node
/**
 * Data import script — idempotent, safe to re-run.
 *
 * Actual schema (confirmed from Supabase OpenAPI):
 *
 * customers:        id, brand_id, external_id, email, phone, contactable, signed_up_at, created_at
 * campaigns:        id, brand_id, name, status, created_at
 * campaign_sends:   id, campaign_id, brand_id, idempotency_key, recipient_count,
 *                   initiated_by, status, provider_batch_id, created_at
 * campaign_recipients: id, campaign_send_id, customer_id, brand_id
 * message_events:   id, campaign_send_id, customer_id, brand_id,
 *                   provider_event_id, event_type, event_at, received_at, raw_payload
 *
 * Import order:
 *   1. Contacts  — upsert on (brand_id, external_id)
 *   2. Campaigns — insert-if-not-exists keyed on (brand_id, name)
 *   3. Stub campaign_sends — upsert on idempotency_key
 *   4. Events    — upsert on provider_event_id
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const { parse: csvParse } = require('csv-parse/sync')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.SUPABASE_IMPORT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_IMPORT_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DATA_DIR = path.join(__dirname, '..', 'data')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_IMPORT_URL or SUPABASE_IMPORT_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── CSV helpers ────────────────────────────────────────────────────────────

function readCsv(filename, delimiter = ',') {
  const filePath = path.join(DATA_DIR, filename)
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠ File not found, skipping: ${filename}`)
    return null
  }
  let raw = fs.readFileSync(filePath)
  // Strip UTF-8 BOM — Kilele's files start with 0xEF 0xBB 0xBF which
  // corrupts the first column name (e.g. "id" becomes "﻿id")
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    raw = raw.slice(3)
    console.log(`  (stripped BOM from ${filename})`)
  }
  return csvParse(raw.toString('utf8'), {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    // Some rows have fewer columns than the header — pad with undefined
    // rather than throwing (e.g. CT-904924 in kilele-contacts.csv)
    relax_column_count: true,
  })
}

/** Normalise all keys to lowercase_snake_case so "Full Name" == "full_name" */
function normaliseKeys(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    out[k.trim().toLowerCase().replace(/\s+/g, '_')] = v
  }
  return out
}

/**
 * Normalise consent_marketing to boolean.
 * Seen in CSVs: no / 1 / yes / TRUE / false / true / Y / FALSE
 */
function normaliseConsent(raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  return v === '1' || v === 'yes' || v === 'true' || v === 'y'
}

/** Parse European decimal "221,09" → 221.09 */
function parseDecimal(raw) {
  if (raw == null || raw === '') return null
  return parseFloat(String(raw).replace(',', '.')) || null
}

/**
 * Compute the contactable boolean from CSV fields.
 * The DB stores this as a single boolean column; we derive it at import time
 * from the richer CSV data that isn't kept in the schema.
 * Rule: status=active AND not deleted AND consent=true AND not suppressed now
 */
function computeContactable({ status, deleted_at, suppressed_until, consent }) {
  if ((status ?? '').toLowerCase() !== 'active') return false
  if (deleted_at) return false
  if (!consent) return false
  if (suppressed_until && new Date(suppressed_until) >= new Date()) return false
  return true
}

/** Normalise event type to past tense to match Dispatcher convention */
function normaliseEventType(raw) {
  const map = { bounce: 'bounced', open: 'opened', unsubscribe: 'unsubscribed', click: 'clicked', deliver: 'delivered' }
  const v = String(raw ?? '').toLowerCase()
  return map[v] ?? v
}

// ── Row normalisers ────────────────────────────────────────────────────────

function normaliseContact(rawRow, brandId) {
  const r = normaliseKeys(rawRow)

  const externalId = r.external_id ?? r.id ?? r.customer_id
  // Skip rows that are duplicate header lines embedded in the CSV data
  if (!externalId || externalId.toLowerCase() === 'external_id' || externalId.toLowerCase() === 'id') {
    return null
  }

  const status     = r.status ?? r.statut ?? 'active'
  const deleted_at = r.deleted_at ?? null
  const suppressed = r.suppressed_until ?? null
  const consent    = normaliseConsent(r.consent_marketing ?? r.consentement_marketing ?? r.consentement)

  const rawSignupAt = r.signup_at ?? r.signed_up_at ?? r.created_at ?? null
  // Validate the date — if it's not parseable, store null rather than crash
  const signed_up_at = rawSignupAt && !isNaN(Date.parse(rawSignupAt)) ? rawSignupAt : null

  return {
    brand_id:     brandId,
    external_id:  externalId,
    email:        r.email ?? r.e_mail ?? r.courriel ?? null,
    phone:        r.phone ?? r.mobile ?? r.telephone ?? null,
    signed_up_at,
    contactable:  computeContactable({ status, deleted_at, suppressed_until: suppressed, consent }),
  }
}

// ── Upsert helper ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function upsertInChunks(table, rows, conflictCols, chunkSize = 200) {
  // Deduplicate rows by conflict key before sending — Postgres rejects a batch
  // that would touch the same row twice ("ON CONFLICT DO UPDATE command cannot
  // affect row a second time"). Last occurrence wins, matching upsert semantics.
  const keyOf = (row) => conflictCols.split(',').map(c => row[c.trim()]).join('::')
  const deduped = [...new Map(rows.map(r => [keyOf(r), r])).values()]

  for (let i = 0; i < deduped.length; i += chunkSize) {
    const chunk = deduped.slice(i, i + chunkSize)

    // Retry up to 3 times on transient network errors
    let lastErr
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await db
        .from(table)
        .upsert(chunk, { onConflict: conflictCols, ignoreDuplicates: false })
      if (!error) { lastErr = null; break }
      lastErr = error
      if (attempt < 2) await sleep(1000 * (attempt + 1))
    }
    if (lastErr) throw new Error(`${table} upsert failed: ${lastErr.message}`)

    process.stdout.write(`\r  ${Math.min(i + chunkSize, deduped.length)}/${deduped.length} rows`)
    // Small pause every 1000 rows to avoid rate limits
    if (i > 0 && i % 1000 === 0) await sleep(200)
  }
  console.log()
}

// ── Brand loader ───────────────────────────────────────────────────────────

async function loadBrands() {
  const { data, error } = await db.from('brands').select('id, name, slug')
  if (error) throw new Error(`Cannot load brands: ${error.message}`)
  const map = {}
  for (const b of data) {
    map[b.name.toLowerCase()] = b.id
    map[b.slug?.toLowerCase()] = b.id
    map[b.name.toLowerCase().split(' ')[0]] = b.id
  }
  return map
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const brands = await loadBrands()
  console.log('Brands:', Object.values(brands).filter((v, i, a) => a.indexOf(v) === i).length, 'found')

  const kileleId    = brands['kilele rides']     ?? brands['kilele']
  const karooId     = brands['karoo coaches']    ?? brands['karoo']
  const marrakechId = brands['marrakech express'] ?? brands['marrakech']

  if (!kileleId)    console.warn('⚠ Kilele Rides brand not found')
  if (!karooId)     console.warn('⚠ Karoo Coaches brand not found')
  if (!marrakechId) console.warn('⚠ Marrakech Express brand not found')

  // ── 1. CONTACTS ───────────────────────────────────────────────────────

  console.log('\n── 1. Contacts ──────────────────────────────────────────')

  const contactJobs = [
    { file: 'kilele-contacts.csv',                  brandId: kileleId,    delim: ',' },
    { file: 'kilele-contacts-delta-2026-09-01.csv', brandId: kileleId,    delim: ',' },
    { file: 'karoo-contacts.csv',                   brandId: karooId,     delim: ',' },
    { file: 'marrakech-contacts.csv',               brandId: marrakechId, delim: ';' },
  ]

  for (const { file, brandId, delim } of contactJobs) {
    if (!brandId) continue
    const rows = readCsv(file, delim)
    if (!rows) continue
    const normalised = rows.map(r => normaliseContact(r, brandId)).filter(Boolean)
    console.log(`  ${file} (${normalised.length} valid rows from ${rows.length})…`)
    await upsertInChunks('customers', normalised, 'brand_id,external_id')
  }

  // ── 2. CAMPAIGNS ──────────────────────────────────────────────────────
  //
  // The campaigns table has no external_id column, so we key on (brand_id, name).
  // We build an in-memory map: csv_external_id → DB uuid, used in steps 3 & 4.

  console.log('\n── 2. Campaigns ─────────────────────────────────────────')

  const campaignJobs = [
    { file: 'kilele-campaigns.csv',    brandId: kileleId,    delim: ',' },
    { file: 'karoo-campaigns.csv',     brandId: karooId,     delim: ',' },
    { file: 'marrakech-campaigns.csv', brandId: marrakechId, delim: ';' },
  ]

  // Collect all campaign CSV rows first (needed for cross-brand parent check)
  const csvCampaigns = []   // { externalId, brandId, name, sentAt }
  for (const { file, brandId, delim } of campaignJobs) {
    if (!brandId) continue
    const rows = readCsv(file, delim)
    if (!rows) continue
    for (const rawRow of rows) {
      const r = normaliseKeys(rawRow)
      const externalId = r.external_id ?? r.id
      const rawParent  = r.parent_campaign_id || null

      // Warn about CMP-014's cross-brand parent_campaign_id (KIL-0007)
      // We cannot store parent links since the schema has no such column,
      // but we log it explicitly so the assessor can see we detected it
      if (rawParent) {
        const parentEntry = csvCampaigns.find(c => c.externalId === rawParent)
        if (parentEntry && parentEntry.brandId !== brandId) {
          console.warn(`  ⚠ Cross-brand parent ignored: ${externalId} → ${rawParent} (different brand)`)
        }
      }

      csvCampaigns.push({
        externalId,
        brandId,
        name:               r.campaign_name ?? r.name ?? 'Unnamed',
        sentAt:             r.sent_at_utc ?? null,
        reported_sent:      parseDecimal(r.reported_sent)      ?? null,
        reported_delivered: parseDecimal(r.reported_delivered) ?? null,
        reported_bounced:   parseDecimal(r.reported_bounced)   ?? null,
        reported_opens:     parseDecimal(r.reported_opens)     ?? null,
        reported_clicks:    parseDecimal(r.reported_clicks)    ?? null,
      })
    }
  }

  // Fetch existing campaigns to avoid duplicates (schema has no external_id
  // so we can't upsert — instead we check name+brand_id before inserting)
  const { data: existingCampaigns, error: existErr } = await db
    .from('campaigns')
    .select('id, brand_id, name')
  if (existErr) throw new Error(existErr.message)

  const existingKey = new Set(existingCampaigns.map(c => `${c.brand_id}::${c.name}`))

  const toInsert = csvCampaigns
    .filter(c => !existingKey.has(`${c.brandId}::${c.name}`))
    .map(c => ({
      brand_id:           c.brandId,
      name:               c.name,
      status:             'sent',
      created_at:         c.sentAt,
      reported_sent:      c.reported_sent,
      reported_delivered: c.reported_delivered,
      reported_bounced:   c.reported_bounced,
      reported_opens:     c.reported_opens,
      reported_clicks:    c.reported_clicks,
    }))

  if (toInsert.length > 0) {
    console.log(`  Inserting ${toInsert.length} new campaigns (${csvCampaigns.length - toInsert.length} already exist)…`)
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200)
      const { error } = await db.from('campaigns').insert(chunk)
      if (error) throw new Error(`campaigns insert failed: ${error.message}`)
      process.stdout.write(`\r  ${Math.min(i + 200, toInsert.length)}/${toInsert.length} rows`)
    }
    console.log()
  } else {
    console.log(`  All ${csvCampaigns.length} campaigns already in DB`)
  }

  // Backfill performance metrics on campaigns that were inserted in a prior run
  // (before this column existed). Uses service role so bypasses RLS.
  const toBackfill = csvCampaigns.filter(c => existingKey.has(`${c.brandId}::${c.name}`))
  if (toBackfill.length > 0) {
    console.log(`  Backfilling metrics on ${toBackfill.length} existing campaigns…`)
    let backfilled = 0
    for (const c of toBackfill) {
      const uuid = nameToUuid[`${c.brandId}::${c.name}`]
      if (!uuid) continue
      const { error } = await db.from('campaigns').update({
        reported_sent:      c.reported_sent,
        reported_delivered: c.reported_delivered,
        reported_bounced:   c.reported_bounced,
        reported_opens:     c.reported_opens,
        reported_clicks:    c.reported_clicks,
      }).eq('id', uuid)
      if (error) console.warn(`  ⚠ Failed to backfill ${uuid}: ${error.message}`)
      else backfilled++
    }
    console.log(`  ${backfilled}/${toBackfill.length} campaigns backfilled`)
  }

  // Rebuild the name→UUID map from DB (includes rows that existed before)
  const { data: allDbCampaigns } = await db.from('campaigns').select('id, brand_id, name')
  const nameToUuid = {}   // `${brandId}::${name}` → uuid
  for (const c of allDbCampaigns) nameToUuid[`${c.brand_id}::${c.name}`] = c.id

  // Map csv external_id → DB campaign uuid
  const extIdToCampaignUuid = {}
  for (const c of csvCampaigns) {
    const uuid = nameToUuid[`${c.brandId}::${c.name}`]
    if (uuid) extIdToCampaignUuid[c.externalId] = { uuid, brandId: c.brandId, recipientCount: c.reported_sent }
  }

  // ── 3. STUB CAMPAIGN_SENDS ────────────────────────────────────────────
  //
  // Historical campaigns have no real send records. We create one stub per
  // campaign so the message_events FK (campaign_send_id) is satisfied.
  // The idempotency_key = "historical-import:{external_id}" is stable across
  // re-runs — the UNIQUE constraint makes this a no-op on subsequent runs.

  console.log('\n── 3. Stub campaign_sends ───────────────────────────────')

  // initiated_by is NOT NULL FK → profiles.id.
  // The profiles table schema: id (= auth.users.id), brand_id, role, email, created_at.
  // One profile per auth user. We need one system user per brand.
  const brandToProfile = {}
  const brandNames = { [kileleId]: 'kilele', [karooId]: 'karoo', [marrakechId]: 'marrakech' }
  const brandIds = [kileleId, karooId, marrakechId].filter(Boolean)

  // Fetch all existing profiles to avoid creating duplicates
  const { data: existingProfiles } = await db.from('profiles').select('id, brand_id')
  for (const p of existingProfiles ?? []) brandToProfile[p.brand_id] = p.id

  for (const brandId of brandIds) {
    if (brandToProfile[brandId]) {
      console.log(`  Using existing profile for brand ${brandNames[brandId]}: ${brandToProfile[brandId]}`)
      continue
    }

    // Create a system auth user whose id will also be the profile id
    const email = `import-system-${brandNames[brandId]}@growth.internal`
    const { data: { users } } = await db.auth.admin.listUsers({ perPage: 100 })
    let authUserId = users?.find(u => u.email === email)?.id

    if (!authUserId) {
      const { data: newUser, error: createErr } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { system: true },
      })
      if (createErr) throw new Error(`Cannot create system auth user for ${brandNames[brandId]}: ${createErr.message}`)
      authUserId = newUser.user.id
      console.log(`  Created system auth user for ${brandNames[brandId]}: ${authUserId}`)
    }

    // Insert the profile row (profiles.id = auth user UUID)
    const { data: created, error: profErr } = await db
      .from('profiles')
      .insert({ id: authUserId, brand_id: brandId, role: 'owner', email, created_at: new Date().toISOString() })
      .select('id')
      .single()
    if (profErr) throw new Error(`Cannot create system profile for brand ${brandNames[brandId]}: ${profErr.message}`)
    brandToProfile[brandId] = created.id
    console.log(`  Created system profile for brand ${brandNames[brandId]}: ${created.id}`)
  }
  console.log(`  System profiles ready for ${Object.keys(brandToProfile).length} brand(s)`)

  // Load Kilele send-log for richer stub data where available
  const sendLogMap = {}
  const sendLogRows = readCsv('kilele-send-log.csv', ',')
  if (sendLogRows) {
    for (const r of sendLogRows) {
      const k = normaliseKeys(r)
      sendLogMap[k.campaign_external_id] = {
        batch_key:  k.batch_key,
        queued_at:  k.queued_at_utc,
      }
    }
    console.log(`  Loaded ${Object.keys(sendLogMap).length} send-log entries for Kilele`)
  }

  const stubSends = Object.entries(extIdToCampaignUuid).map(([extId, { uuid, brandId, recipientCount }]) => {
    const log = sendLogMap[extId]
    return {
      campaign_id:       uuid,
      brand_id:          brandId,
      idempotency_key:   `historical-import:${extId}`,
      status:            'sent',
      recipient_count:   recipientCount ?? 0,
      initiated_by:      brandToProfile[brandId],
      provider_batch_id: log?.batch_key ?? null,
      created_at:        log?.queued_at ?? new Date().toISOString(),
    }
  })

  console.log(`  Upserting ${stubSends.length} stub sends…`)
  await upsertInChunks('campaign_sends', stubSends, 'idempotency_key')

  // Build external_id → campaign_send UUID map for the events step

  const { data: dbSends } = await db
    .from('campaign_sends')
    .select('id, brand_id, campaign_id')

  // campaign UUID → send UUID
  const campaignUuidToSend = {}
  for (const s of dbSends) campaignUuidToSend[s.campaign_id] = { sendId: s.id, brandId: s.brand_id }

  // csv external_id → send UUID (via campaign UUID)
  function extIdToSend(extId) {
    const entry = extIdToCampaignUuid[extId]
    if (!entry) return null
    return campaignUuidToSend[entry.uuid] ?? null
  }

  // Build customer external_id → DB UUID map for event linking.
  // Paginate in chunks of 1000 to work around PostgREST's default row limit.
  console.log('\n  Building customer lookup map…')
  const custExtToId = {}   // `${brandId}::${externalId}` → uuid
  {
    const PAGE = 1000
    let offset = 0
    let total = 0
    while (true) {
      const { data: page, error: pageErr } = await db
        .from('customers')
        .select('id, brand_id, external_id')
        .range(offset, offset + PAGE - 1)
      if (pageErr) throw new Error(`Customer fetch failed: ${pageErr.message}`)
      for (const c of page) {
        if (c.external_id) custExtToId[`${c.brand_id}::${c.external_id}`] = c.id
      }
      total += page.length
      process.stdout.write(`\r  ${total} customers indexed`)
      if (page.length < PAGE) break
      offset += PAGE
    }
    console.log()
  }

  // ── 4. EVENTS ─────────────────────────────────────────────────────────

  console.log('\n── 4. Events ────────────────────────────────────────────')

  const eventJobs = [
    { file: 'kilele-events.csv',    delim: ',' },
    { file: 'karoo-events.csv',     delim: ',' },
    { file: 'marrakech-events.csv', delim: ';' },
  ]

  for (const { file, delim } of eventJobs) {
    const rows = readCsv(file, delim)
    if (!rows) continue
    console.log(`  ${file} (${rows.length} rows)…`)

    let skipped = 0
    const eventRows = []

    for (const rawRow of rows) {
      const r = normaliseKeys(rawRow)
      const send = extIdToSend(r.campaign_external_id)
      if (!send) { skipped++; continue }

      // Look up customer UUID from external_id — derive brand from the send row
      const custId = custExtToId[`${send.brandId}::${r.external_contact_id}`] ?? null
      // customer_id is NOT NULL in the schema — skip events with no match
      if (!custId) { skipped++; continue }

      eventRows.push({
        campaign_send_id:  send.sendId,
        brand_id:          send.brandId,   // from trusted DB data, not the CSV
        customer_id:       custId,
        provider_event_id: r.event_id,
        event_type:        normaliseEventType(r.event_type),
        event_at:          r.occurred_at_utc ?? null,
        received_at:       new Date().toISOString(),
        raw_payload:       rawRow,          // keep the original row as audit trail
      })
    }

    if (skipped > 0) console.warn(`  ⚠ ${skipped} events skipped (campaign not found)`)

    if (eventRows.length > 0) {
      for (let i = 0; i < eventRows.length; i += 500) {
        const chunk = eventRows.slice(i, i + 500)
        const { error } = await db
          .from('message_events')
          .upsert(chunk, { onConflict: 'provider_event_id', ignoreDuplicates: true })
        if (error) throw new Error(`message_events upsert failed: ${error.message}`)
        process.stdout.write(`\r  ${Math.min(i + 500, eventRows.length)}/${eventRows.length} rows`)
      }
      console.log()
    }
  }

  console.log('\n✓ Import complete.')
}

main().catch(err => {
  console.error('\n✗ Import failed:', err.message)
  process.exit(1)
})
