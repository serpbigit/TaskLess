from google import genai
from google.genai.types import HttpOptions
import json
import re

client = genai.Client(
    vertexai=True,
    project="dealwise-491419",
    location="us-central1",
    http_options=HttpOptions(api_version="v1"),
)

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="""
Return ONLY a valid JSON object.
No markdown fences.
No explanation.
Schema:
{"decision":"reply","confidence":0.0,"replyText":"...","needsUserChoice":false}
"""
)

text = response.text.strip()
text = re.sub(r"^```(?:json)?\s*", "", text)
text = re.sub(r"\s*```$", "", text)

obj = json.loads(text)
print(json.dumps(obj, ensure_ascii=False))
