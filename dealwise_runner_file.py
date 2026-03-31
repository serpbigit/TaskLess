from google import genai
from google.genai.types import HttpOptions
import json
import re
import sys
from pathlib import Path

INPUT_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dealwise_input.json")

data = json.loads(INPUT_FILE.read_text(encoding="utf-8"))

SYSTEM_PROMPT = """
You are the decision engine for DealWise, an automated CRM and communications assistant.

Return ONLY a valid JSON object.
No markdown fences.
No explanation.

Rules:
- Be concise and practical.
- replyText must contain only the customer-facing draft reply, never commentary.
- confidence must be a number between 0 and 1.
- needsUserChoice is true only if missing information prevents a good reply.
- userChoices should be short numbered-style options the boss can choose from.
- reasonShort should be brief and internal.

Schema:
{
  "decision": "reply|wait|ask_user|ignore",
  "confidence": 0.0,
  "replyText": "",
  "needsUserChoice": false,
  "userChoices": [],
  "reasonShort": ""
}
"""

PROMPT = f"""{SYSTEM_PROMPT}

Input JSON:
{json.dumps(data, ensure_ascii=False, indent=2)}

Return the best next action object now.
"""

client = genai.Client(
    vertexai=True,
    project="dealwise-491419",
    location="us-central1",
    http_options=HttpOptions(api_version="v1"),
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=PROMPT
)

text = response.text.strip()
text = re.sub(r"^```(?:json)?\s*", "", text)
text = re.sub(r"\s*```$", "", text)

obj = json.loads(text)
print(json.dumps(obj, ensure_ascii=False))
