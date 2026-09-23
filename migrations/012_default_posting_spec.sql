-- Make the CoverWise Lead Posting API spec the default posting_spec for every
-- source. New sources inherit it automatically; existing sources with no spec
-- yet are backfilled. Sources with a custom spec are left untouched.
-- Run once in Supabase (safe to re-run).

do $$
declare spec text := $spec$CoverWise — Lead Posting API Specification

Post final-expense leads into CoverWise in real time. One lead per request. Leads are de-duplicated.

ENDPOINT
POST https://crm.gocoverwise.com/api/ingest
Content-Type: application/json

AUTHENTICATION (required)
An API key is required on every request. Each vendor is issued a key.
  X-API-KEY: your-source-key-here
Requests without a valid key are rejected. Keep the key server-side; do not embed it in browsers or mobile apps.

FIELDS
Send a flat JSON object. Field names are case-insensitive; spaces/hyphens are ignored. Unknown fields are ignored. Common alternate names are accepted (see Aliases).

  Field                     Required   Format / notes
  first_name                Required   Lead first name.
  last_name                 Required   Lead last name.
  phone                     Required   10-digit US number. Primary de-duplication key.
  email                     Required   Valid email. Secondary de-duplication key.
  address1                  Required   Street address.
  city                      Required   City.
  state                     Required   2-letter code (e.g. TX). Drives routing, calling hours, and local caller ID.
  zip                       Required   5-digit ZIP.
  address2                  Optional   Apt / unit.
  dob                       Optional   Date of birth, YYYY-MM-DD. Preferred over age.
  age                       Optional   Whole number, if DOB not available.
  gender                    Optional   Male / Female (also accepts m/f).
  tobacco                   Optional   yes/no (also true/false, y/n, 1/0).
  coverage_amount           Optional   Requested face amount, numeric (e.g. 10000).
  beneficiary_name          Optional   Beneficiary full name.
  beneficiary_relationship  Optional   e.g. Spouse, Son.
  consent_ref               Required   TCPA consent reference (ID or URL). Stored as the consent record.

ACCEPTED ALIASES
  Maps to            Also accepted
  first_name         firstname, fname
  last_name          lastname, lname
  phone              phonenumber, tel, mobile
  email              emailaddress
  zip                zipcode, postal
  state              st
  dob                dateofbirth, birthdate
  coverage_amount    coverage, face_amount, faceamount
  beneficiary_name   beneficiary

EXAMPLE REQUEST
curl -X POST https://crm.gocoverwise.com/api/ingest \
  -H "X-API-KEY: your-source-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "last_name": "Doe",
    "phone": "555-201-3040",
    "email": "jane@example.com",
    "address1": "123 Main St",
    "city": "Dallas",
    "state": "TX",
    "zip": "75001",
    "dob": "1955-04-12",
    "gender": "Female",
    "tobacco": "no",
    "coverage_amount": 10000,
    "beneficiary_name": "John Doe",
    "beneficiary_relationship": "Spouse",
    "consent_ref": "https://vendor.example/consent/abc123"
  }'

RESPONSES
  HTTP   Body                                                 Meaning
  201    { "status": "created", "id": "<lead id>" }           Lead accepted and created.
  200    { "status": "duplicate", "id": "<existing id>" }     Same phone or email already exists; not re-created.
  422    { "status": "rejected", "reason": "missing_contact" } No phone or email — lead not usable.
  401    { "error": "missing api key" | "invalid api key" }   Missing or unrecognized key.
  400    { "error": "<message>" }                             Validation error.

NOTES
- HTTPS only. Post one lead per request, in real time.
- De-duplication is per CoverWise account, by phone first then email.
- On success the lead is auto-assigned to a licensed agent and tagged to your source for reporting.
- For a key or questions, contact your CoverWise administrator.$spec$;
begin
  -- Default for any source created from now on.
  execute format('alter table lead_sources alter column posting_spec set default %L', spec);
  -- Backfill sources that don't have their own spec yet.
  update lead_sources set posting_spec = spec where posting_spec is null or btrim(posting_spec) = '';
  raise notice 'Default posting spec applied.';
end $$;
