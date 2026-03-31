from google import genai
from google.genai.types import HttpOptions
import json
import re
import sys

PROMPT = """
You are the decision engine for a CRM and communications assistant.

Return ONLY a valid JSON object.
No markdown fences.
No explanation.

Rules:
- Be concise.
- replyText must contain only the draft reply to the customer, not commentary.
- confidence must be a number between 0 and 1.
- needsUserChoice is true only if missing information prevents a good reply.

Schema:
{
  "decision": "reply|wait|ask_user|ignore",
  "confidence": 0.0,
  "replyText": "",
  "needsUserChoice": false,
  "userChoices": [],
  "reasonShort": ""
}

Input:
A customer wrote: "Hi, just checking if you saw my message and whether we can move forward this week."
Context:
- The business owner wants to sound warm and concise.
- No price was discussed yet.
- The owner is interested in moving the conversation forward.

Return the best next reply draft.
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
