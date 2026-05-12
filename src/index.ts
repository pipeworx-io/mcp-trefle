interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Trefle MCP — global plant database (1M+ species)
 *
 * Trefle catalogs scientific name, family, growth habit, edible/medicinal
 * flags, native range, images, and observation distribution. Pairs with
 * `inaturalist` for "what is this plant" and `gbif` for occurrences.
 *
 * Note: Trefle development has been slow since 2024 and the upstream is
 * occasionally flaky. Errors surface as upstream HTTP codes; retry helps.
 *
 * API: https://docs.trefle.io
 * Auth: `?token=<api_key>` query. Free, register at trefle.io.
 *
 * Tools:
 * - search_plants:   text search across all plants
 * - get_plant:       full plant record (with main species)
 * - search_species:  text search across the species rank specifically
 * - get_species:     full species record (growth, distribution, images)
 * - list_distributions: native ranges for a zone (TDWG WGSRPD level)
 */


const BASE_URL = 'https://trefle.io/api/v1';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_plants',
    description:
      'Search plants by common or scientific name. Returns Trefle plant ID, scientific name, common name, family, image. Filter by edible flags.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query' },
        edible: { type: 'boolean', description: 'Only edible plants' },
        vegetable: { type: 'boolean', description: 'Only vegetables' },
        page: { type: 'number', description: '1-based page' },
        page_size: { type: 'number', description: '1-100 (default 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_plant',
    description: 'Full plant record by Trefle ID. Returns scientific/common names, family, status, image, year, main species.',
    inputSchema: {
      type: 'object',
      properties: {
        plant_id: { type: 'number', description: 'Trefle plant ID' },
      },
      required: ['plant_id'],
    },
  },
  {
    name: 'search_species',
    description: 'Search species (the rank below plants — some plants have multiple species). Returns Trefle species ID + scientific name.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text query' },
        page: { type: 'number', description: '1-based page' },
        page_size: { type: 'number', description: '1-100' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_species',
    description:
      'Full species record: growth habit, light/atmospheric humidity/soil requirements, edible / medicinal flags, distribution, images, sources.',
    inputSchema: {
      type: 'object',
      properties: {
        species_id: { type: 'number', description: 'Trefle species ID' },
      },
      required: ['species_id'],
    },
  },
  {
    name: 'list_distributions',
    description:
      'Native or introduced distribution zones (TDWG WGSRPD codes — e.g., "NWY" = Norway, "CAL" = California). Returns species lists by zone.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: { type: 'string', description: 'TDWG zone code (e.g., "CAL", "FRA", "JAP")' },
        page: { type: 'number', description: '1-based page' },
        page_size: { type: 'number', description: '1-100' },
      },
      required: ['zone'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = (args._apiKey as string | undefined)?.trim();
  if (!apiKey) {
    throw new Error(
      'Trefle requires an API token. Contact the operator about platform credentials, or BYO via ?_apiKey=<token> after registering at https://trefle.io.',
    );
  }
  switch (name) {
    case 'search_plants':
      return searchPlants(apiKey, args);
    case 'get_plant':
      return getPlant(apiKey, reqNum(args, 'plant_id', '189734'));
    case 'search_species':
      return searchSpecies(apiKey, args);
    case 'get_species':
      return getSpecies(apiKey, reqNum(args, 'species_id', '189734'));
    case 'list_distributions':
      return listDistributions(apiKey, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqNum(args: Record<string, unknown>, key: string, example: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Required argument "${key}" must be a number. Example: ${example}.`);
  }
  return v;
}

async function trefleFetch<T>(apiKey: string, path: string, params: URLSearchParams): Promise<T> {
  params.set('token', apiKey);
  const url = `${BASE_URL}${path}?${params}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 401 || res.status === 403) throw new Error('Trefle: unauthorized — check the API token');
  if (res.status === 404) throw new Error('Trefle: not found (HTTP 404)');
  if (res.status === 429) throw new Error('Trefle: rate-limit (HTTP 429)');
  if (res.status >= 500) {
    throw new Error(`Trefle: upstream ${res.status} — Trefle.io has been flaky; retry shortly.`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Trefle error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

interface TreflePlantSummary {
  id?: number;
  common_name?: string | null;
  scientific_name?: string;
  family?: string;
  family_common_name?: string | null;
  genus?: string;
  image_url?: string | null;
  slug?: string;
  year?: number | null;
  bibliography?: string;
  author?: string;
  status?: string;
  rank?: string;
}

function normalizePlant(p: TreflePlantSummary) {
  return {
    id: p.id ?? null,
    scientific_name: p.scientific_name ?? null,
    common_name: p.common_name ?? null,
    family: p.family ?? null,
    family_common_name: p.family_common_name ?? null,
    genus: p.genus ?? null,
    year: p.year ?? null,
    author: p.author ?? null,
    status: p.status ?? null,
    rank: p.rank ?? null,
    image: p.image_url ?? null,
    slug: p.slug ?? null,
    trefle_url: p.id ? `https://trefle.io/api/v1/plants/${p.id}` : null,
  };
}

async function searchPlants(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    q: String(args.query),
    page: String(Math.max(1, (args.page as number) ?? 1)),
  });
  const pageSize = Math.min(100, Math.max(1, (args.page_size as number) ?? 20));
  // Trefle uses page-based paging without an explicit size param everywhere; pass anyway
  params.set('per_page', String(pageSize));
  if (args.edible) params.set('filter[edible]', 'true');
  if (args.vegetable) params.set('filter[vegetable]', 'true');

  const data = await trefleFetch<{ data?: TreflePlantSummary[]; meta?: { total?: number } }>(
    apiKey,
    '/plants/search',
    params,
  );
  return {
    total: data.meta?.total ?? 0,
    returned: data.data?.length ?? 0,
    plants: (data.data ?? []).map(normalizePlant),
  };
}

async function getPlant(apiKey: string, plantId: number) {
  const data = await trefleFetch<{ data?: Record<string, unknown> }>(
    apiKey,
    `/plants/${plantId}`,
    new URLSearchParams(),
  );
  return data.data ?? null;
}

async function searchSpecies(apiKey: string, args: Record<string, unknown>) {
  const params = new URLSearchParams({
    q: String(args.query),
    page: String(Math.max(1, (args.page as number) ?? 1)),
  });
  params.set('per_page', String(Math.min(100, Math.max(1, (args.page_size as number) ?? 20))));
  const data = await trefleFetch<{ data?: TreflePlantSummary[]; meta?: { total?: number } }>(
    apiKey,
    '/species/search',
    params,
  );
  return {
    total: data.meta?.total ?? 0,
    returned: data.data?.length ?? 0,
    species: (data.data ?? []).map(normalizePlant),
  };
}

async function getSpecies(apiKey: string, speciesId: number) {
  const data = await trefleFetch<{ data?: Record<string, unknown> }>(
    apiKey,
    `/species/${speciesId}`,
    new URLSearchParams(),
  );
  return data.data ?? null;
}

async function listDistributions(apiKey: string, args: Record<string, unknown>) {
  const zone = String(args.zone).toUpperCase();
  const params = new URLSearchParams({
    page: String(Math.max(1, (args.page as number) ?? 1)),
  });
  params.set('per_page', String(Math.min(100, Math.max(1, (args.page_size as number) ?? 20))));
  const data = await trefleFetch<{ data?: TreflePlantSummary[]; meta?: { total?: number } }>(
    apiKey,
    `/distributions/${encodeURIComponent(zone)}/plants`,
    params,
  );
  return {
    zone,
    total: data.meta?.total ?? 0,
    returned: data.data?.length ?? 0,
    plants: (data.data ?? []).map(normalizePlant),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
