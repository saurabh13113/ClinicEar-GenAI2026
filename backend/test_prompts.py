import anthropic
import json

# Insert Claude API key
client = anthropic.Anthropic(api_key="...")

# Consultation scripts
transcripts = []

EXTRACTION_PROMPT = open("prompts/extraction.txt").read()
SOAP_PROMPT = open("prompts/soap_note.txt").read()
AUDIT_PROMPT = open("prompts/audit.txt").read()

passed = 0
failed = 0

print("EXTRACTION TESTS")

extraction_results = []  # store for SOAP tests below
soap_results = [] # store for audit tests below

for i, transcript in enumerate(transcripts):
    print(f"\n--- Test {i+1} ---")
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1000,
            messages=[{"role": "user", "content": f"{EXTRACTION_PROMPT}\n\n{transcript}"}]
        )

        parsed = json.loads(response.content[0].text)
        extraction_results.append(parsed)

        scores = parsed["confidence_scores"]
        variance = max(scores.values()) - min(scores.values())
        gap_count = len(parsed["gaps"])
        icd_count = len(parsed["icd10_suggestions"])

        print(f"✓ Parsed OK")
        print(f"  Score variance: {variance:.2f} {'✓' if variance > 0.2 else '✗ TOO FLAT'}")
        print(f"  Gaps: {gap_count} {'✓' if gap_count >= 2 else '✗ TOO FEW'}")
        print(f"  ICD-10: {icd_count} {'✓' if icd_count >= 1 else '✗ MISSING'}")

        if variance > 0.2 and gap_count >= 2 and icd_count >= 1:
            passed += 1
        else:
            failed += 1

    except json.JSONDecodeError:
        print(f"✗ JSON parse failed — Claude returned:")
        print(response.content[0].text[:200])
        extraction_results.append(None)
        failed += 1
    except anthropic.APIError as e:
        print(f"✗ API error: {e}")
        extraction_results.append(None)
        failed += 1

print(f"\n=== Extraction: {passed} passed, {failed} failed ===")

print("\n" + "=" * 50 + "\n")
print("SOAP NOTE TESTS")

for i, extraction in enumerate(extraction_results):
    if extraction is None:
        print(f"\n--- Test {i+1} --- SKIPPED")
        soap_results.append(None)
        continue
    print(f"\n--- Test {i+1} ---")
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        messages=[{"role": "user", "content": f"{SOAP_PROMPT}\n\n{json.dumps(extraction)}"}]
    )
    soap_note = response.content[0].text
    soap_results.append(soap_note)
    print(soap_note[:300])

print("\n" + "=" * 50 + "\n")
print("AUDIT TESTS")

for i, soap_note in enumerate(soap_results):
    if soap_note is None:
        print(f"\n--- Test {i+1} --- SKIPPED")
        continue
    print(f"\n--- Test {i+1} ---")
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1000,
        messages=[{"role": "user", "content": f"{AUDIT_PROMPT}\n\n{soap_note}"}]
    )
    print(response.content[0].text)