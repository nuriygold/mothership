export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

// Drizzle stores JSON via jsonb; these types describe the accepted JS values.
export type InputJsonArray = JsonArray;
export type InputJsonObject = JsonObject;
export type InputJsonValue = JsonValue;
