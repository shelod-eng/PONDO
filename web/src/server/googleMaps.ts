type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GoogleAutocompleteSuggestion = {
  placePrediction?: {
    placeId?: string;
    text?: {
      text?: string;
    };
    structuredFormat?: {
      mainText?: {
        text?: string;
      };
      secondaryText?: {
        text?: string;
      };
    };
  };
};

type GoogleAutocompleteResponse = {
  suggestions?: GoogleAutocompleteSuggestion[];
};

type GooglePlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type GoogleAddressValidationResponse = {
  result?: {
    verdict?: {
      addressComplete?: boolean;
      hasInferredComponents?: boolean;
      hasReplacedComponents?: boolean;
      hasUnconfirmedComponents?: boolean;
      validationGranularity?: string;
      possibleNextAction?: string;
    };
    address?: {
      formattedAddress?: string;
      postalAddress?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
        postalCode?: string;
        regionCode?: string;
      };
      addressComponents?: Array<{
        componentName?: { text?: string };
        componentType?: string;
        confirmationLevel?: string;
        inferred?: boolean;
        replaced?: boolean;
      }>;
    };
    geocode?: {
      location?: {
        latitude?: number;
        longitude?: number;
      };
      placeId?: string;
    };
  };
};

export type AddressSuggestion = {
  placeId: string;
  text: string;
  mainText: string;
  secondaryText: string;
};

export type GoogleResolvedAddress = {
  formattedAddress: string;
  city: string;
  province: string;
  postalCode: string;
  placeId: string;
  latitude: number | null;
  longitude: number | null;
};

export type ValidatedAddressResult = GoogleResolvedAddress & {
  verdict: "validated" | "needs_confirmation";
  addressComplete: boolean;
  hasInferredComponents: boolean;
  hasReplacedComponents: boolean;
  hasUnconfirmedComponents: boolean;
  possibleNextAction: string;
};

function getGoogleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export function isGoogleMapsConfigured() {
  return Boolean(getGoogleMapsApiKey());
}

async function googleFetch<T>(url: string, init: RequestInit, fieldMask?: string) {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) throw new Error("google_maps_not_configured");

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Goog-Api-Key", apiKey);
  if (fieldMask) headers.set("X-Goog-FieldMask", fieldMask);

  const res = await fetch(url, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T | { error?: { message?: string } }) : ({} as T);

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "error" in data &&
      typeof data.error === "object" &&
      data.error &&
      "message" in data.error &&
      typeof data.error.message === "string"
        ? data.error.message
        : `google_request_failed_${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

function findComponent(components: GoogleAddressComponent[] | undefined, type: string) {
  return components?.find((component) => component.types?.includes(type));
}

function addressFromComponents(components: GoogleAddressComponent[] | undefined) {
  const city =
    findComponent(components, "locality")?.longText ||
    findComponent(components, "postal_town")?.longText ||
    findComponent(components, "sublocality_level_1")?.longText ||
    "";
  const province = findComponent(components, "administrative_area_level_1")?.longText || "";
  const postalCode = findComponent(components, "postal_code")?.longText || "";
  return { city, province, postalCode };
}

export async function autocompleteAddress(input: string, sessionToken?: string) {
  const data = await googleFetch<GoogleAutocompleteResponse>(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      body: JSON.stringify({
        input,
        includedRegionCodes: ["za"],
        languageCode: "en",
        sessionToken,
      }),
    },
    "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
  );

  return (data.suggestions || [])
    .map((item) => {
      const prediction = item.placePrediction;
      const placeId = prediction?.placeId || "";
      const text = prediction?.text?.text || "";
      if (!placeId || !text) return null;
      return {
        placeId,
        text,
        mainText: prediction?.structuredFormat?.mainText?.text || text,
        secondaryText: prediction?.structuredFormat?.secondaryText?.text || "",
      } satisfies AddressSuggestion;
    })
    .filter(Boolean) as AddressSuggestion[];
}

export async function getPlaceAddress(placeId: string, sessionToken?: string) {
  const params = new URLSearchParams({
    languageCode: "en",
    regionCode: "ZA",
  });
  if (sessionToken) params.set("sessionToken", sessionToken);

  const data = await googleFetch<GooglePlaceDetailsResponse>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`,
    { method: "GET" },
    "id,formattedAddress,addressComponents,location",
  );

  const parts = addressFromComponents(data.addressComponents);
  return {
    formattedAddress: data.formattedAddress || "",
    city: parts.city,
    province: parts.province,
    postalCode: parts.postalCode,
    placeId: data.id || placeId,
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
  } satisfies GoogleResolvedAddress;
}

export async function validateAddress(address: string, sessionToken?: string) {
  const data = await googleFetch<GoogleAddressValidationResponse>(
    "https://addressvalidation.googleapis.com/v1:validateAddress",
    {
      method: "POST",
      body: JSON.stringify({
        address: {
          regionCode: "ZA",
          addressLines: [address],
        },
        sessionToken,
      }),
    },
  );

  const result = data.result;
  const verdict = result?.verdict;
  const postalAddress = result?.address?.postalAddress;
  const formattedAddress =
    result?.address?.formattedAddress ||
    [postalAddress?.addressLines?.join(", "), postalAddress?.locality, postalAddress?.administrativeArea, postalAddress?.postalCode]
      .filter(Boolean)
      .join(", ");

  const hasInferredComponents = Boolean(verdict?.hasInferredComponents);
  const hasReplacedComponents = Boolean(verdict?.hasReplacedComponents);
  const hasUnconfirmedComponents = Boolean(verdict?.hasUnconfirmedComponents);
  const addressComplete = Boolean(verdict?.addressComplete);
  const needsConfirmation = hasInferredComponents || hasReplacedComponents || hasUnconfirmedComponents || !addressComplete;

  return {
    formattedAddress,
    city: postalAddress?.locality || "",
    province: postalAddress?.administrativeArea || "",
    postalCode: postalAddress?.postalCode || "",
    placeId: result?.geocode?.placeId || "",
    latitude: result?.geocode?.location?.latitude ?? null,
    longitude: result?.geocode?.location?.longitude ?? null,
    verdict: needsConfirmation ? "needs_confirmation" : "validated",
    addressComplete,
    hasInferredComponents,
    hasReplacedComponents,
    hasUnconfirmedComponents,
    possibleNextAction: verdict?.possibleNextAction || "",
  } satisfies ValidatedAddressResult;
}
