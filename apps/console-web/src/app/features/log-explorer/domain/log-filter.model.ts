export interface FilterChip {
  id: string;
  category: 'level' | 'service' | 'environment' | 'query' | 'time' | 'trace' | 'event';
  label: string;
  value: string;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface FacetsState {
  services: FacetCount[];
  levels: FacetCount[];
  environments: FacetCount[];
  actions: FacetCount[];
  loading: boolean;
  error: string | null;
}

export const INITIAL_FACETS_STATE: FacetsState = {
  services: [],
  levels: [],
  environments: [],
  actions: [],
  loading: false,
  error: null,
};
