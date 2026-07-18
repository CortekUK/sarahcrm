import type { EnrichmentProvider } from './provider'
import type { EnrichmentResult } from './types'

// No-op provider used when no real provider/key is configured, so the whole
// enrichment path scaffolds and runs safely regardless of environment.
export class StubProvider implements EnrichmentProvider {
  name = 'stub'

  async enrich(): Promise<EnrichmentResult> {
    return { company: null, person: null, raw: null }
  }
}
