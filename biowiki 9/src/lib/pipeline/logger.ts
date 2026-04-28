/**
 * Pipeline run logger
 *
 * Wraps Supabase writes so every pipeline step is persisted to pipeline_runs.
 * This lets the admin dashboard show live progress and error details.
 */

import { createAdminClient } from '@/lib/supabase/server'

export class PipelineLogger {
  private runId: string
  private supabase: ReturnType<typeof createAdminClient>

  private constructor(runId: string) {
    this.runId    = runId
    this.supabase = createAdminClient()
  }

  /** Create a new run record and return a logger bound to it */
  static async start(topic: string, version = '1.0.0'): Promise<PipelineLogger> {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({
        topic,
        status:           'running',
        started_at:       new Date().toISOString(),
        papers_found:     0,
        findings_extracted: 0,
        pipeline_version: version,
      })
      .select('id')
      .single()

    if (error || !data) throw new Error(`Failed to create pipeline run: ${error?.message}`)
    return new PipelineLogger(data.id)
  }

  get id() { return this.runId }

  async update(fields: {
    papers_found?:      number
    findings_extracted?: number
    status?:            'pending' | 'running' | 'completed' | 'failed'
    error_message?:     string
  }) {
    await this.supabase
      .from('pipeline_runs')
      .update(fields)
      .eq('id', this.runId)
  }

  async complete(papersFound: number, findingsExtracted: number) {
    await this.update({
      status:             'completed',
      papers_found:       papersFound,
      findings_extracted: findingsExtracted,
    })
    await this.supabase
      .from('pipeline_runs')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', this.runId)
  }

  async fail(message: string) {
    await this.update({ status: 'failed', error_message: message })
    await this.supabase
      .from('pipeline_runs')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', this.runId)
  }
}
