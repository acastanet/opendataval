const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] } as const;

export const resolveQuerySchema = {
  type: "object", additionalProperties: false, required: ["lat", "lon"],
  properties: { lat: { type: "string", maxLength: 32 }, lon: { type: "string", maxLength: 32 }, horizontalAccuracyMeters: { type: "string", maxLength: 32 }, positionSource: { type: "string", enum: ["browser-geolocation", "manual", "unknown"] } },
} as const;

const provenance = { type: "object", additionalProperties: false, required: ["source", "resolvedAt"], properties: { source: { type: "string" }, resolvedAt: { type: "string", format: "date-time" } } } as const;
const enrichment = (data: object) => ({ type: "object", additionalProperties: false, required: ["status", "data", "provenance"], properties: { status: { type: "string", enum: ["available", "not_found", "unavailable", "timeout"] }, data: { anyOf: [data, { type: "null" }] }, provenance } });

const territoryData = { type: "object", additionalProperties: false, required: ["label", "commune", "department", "epci"], properties: { label: { type: "string" }, commune: { type: "object", additionalProperties: false, required: ["name", "inseeCode"], properties: { name: { type: "string" }, inseeCode: { type: "string" } } }, department: { type: "object", additionalProperties: false, required: ["name", "code"], properties: { name: { type: "string" }, code: { type: "string" } } }, epci: { anyOf: [{ type: "object", additionalProperties: false, required: ["name", "code"], properties: { name: { type: "string" }, code: nullableString } }, { type: "null" }] } } } as const;
const addressData = { type: "object", additionalProperties: false, required: ["formatted", "houseNumber", "street", "postalCode", "city", "precision", "distanceMeters"], properties: { formatted: { type: "string" }, houseNumber: nullableString, street: nullableString, postalCode: nullableString, city: nullableString, precision: { type: "string", enum: ["house", "street", "locality", "unknown"] }, distanceMeters: nullableNumber } } as const;
const elevationData = { type: "object", additionalProperties: false, required: ["meters", "verticalDatum", "horizontalResolutionMeters", "verticalAccuracyMeters", "interpolation"], properties: { meters: { type: "number" }, verticalDatum: nullableString, horizontalResolutionMeters: nullableNumber, verticalAccuracyMeters: nullableNumber, interpolation: nullableString } } as const;

export const resolveResponseSchema = {
  type: "object", additionalProperties: false, required: ["query", "territory", "address", "elevation", "requestId"], properties: {
    query: { type: "object", additionalProperties: false, required: ["latitude", "longitude", "positionSource"], properties: { latitude: { type: "number" }, longitude: { type: "number" }, horizontalAccuracyMeters: { type: "number" }, positionSource: { type: "string", enum: ["browser-geolocation", "manual", "unknown"] } } },
    territory: enrichment(territoryData), address: enrichment(addressData), elevation: enrichment(elevationData), requestId: { type: "string" },
  },
} as const;

export const errorSchema = { type: "object", additionalProperties: false, required: ["error", "requestId"], properties: { error: { type: "object", additionalProperties: false, required: ["code", "message", "retryable"], properties: { code: { type: "string" }, message: { type: "string" }, retryable: { type: "boolean" } } }, requestId: { type: "string" } } } as const;
