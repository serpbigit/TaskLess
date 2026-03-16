# TaskLess System Reconstruction Guide

This guide exists so the system can be rebuilt if critical platform components are lost, deleted, or blocked (e.g., Meta app suspension, developer account restrictions, expired tokens, or removal of the WhatsApp asset).

## Critical Identifiers (must be recorded and recoverable)
- Meta App ID
- Business Manager ID
- WhatsApp Business Account (WABA) ID
- Phone Number ID
- Phone number itself
- System token used by Apps Script

## Phone Registration Requirement
Each new WhatsApp phone number used by the system must be registered via `TL_WA_RegisterPhone`. This function calls the Meta Graph API for the phone number ID and uses the WhatsApp two-step verification PIN. This step is required for every new client phone number attached to the system.

## Business Association
Successful onboarding requires the Meta application to be associated with the correct Business Manager. This association may need to be performed manually through the Meta interface or with verification codes. If the app is not correctly associated, the phone number may appear connected but webhook or messaging can fail.

## Embedded Signup and Retrieval
Embedded signup can be launched using Meta onboarding URLs with configuration parameters; a full SDK integration is not always required. After signup, query the Graph API to retrieve WABA ID, phone number ID, and display phone number. Capture and store these values for routing.

## Routing Knowledge
The routing system must know which `phone_number_id` maps to which Apps Script endpoint. This mapping will be stored in an external routing database (e.g., Cloudflare worker storage).

## Operational Safety
At least one additional developer account should retain access to the Meta app and Business Manager. If the primary developer account is blocked, another trusted developer (friend, family member, or partner) must be able to operate the system.

## Living Disaster Recovery Guide
Update this document whenever new infrastructure components are added. Treat it as the disaster recovery reference for the platform.

## Reconstruction Order of Operations
If the system becomes partially broken, verify in this order:
1. Meta app access
2. Business Manager association
3. WhatsApp Business Account connection
4. Phone number registration
5. Webhook endpoint routing
6. Token validity
