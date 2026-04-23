# Shopify

## Owner
Drake (Adrian) — automation & operations lead.

## Operating notes
- Store lives at the primary Shopify domain; fulfillment is handled via the connected 3PL or in-house depending on SKU.
- Inventory thresholds trigger reorder alerts to Drake automatically.
- Payment gateway reconciles nightly; flag discrepancies over $50 to Drake same-day.
- Abandoned cart sequences run via the email integration — review weekly.
- Seasonal promotions require at least 72-hour lead time for inventory and campaign setup.

## Escalation
1. Fulfillment delays > 48h → Drake pings supplier and updates order notes.
2. Payment dispute filed → loop in Champagne Papi for transaction audit.
3. Store downtime > 15 min → Drake pages Mothership #ops channel and initiates rollback if needed.
