import { z } from "zod"

const envSchema = z.object({
  DATABASE_PATH: z.string().default("./local.db"),

  // GitHub Integration (Phase 1)
  GH_HOST: z.string().optional(),
  GH_TOKEN: z.string().optional(),
  GH_REPOS: z.string().optional(), // comma-separated: "org/repo1,org/repo2"

  // Jira Integration (Phase 2)
  JIRA_HOST: z.string().optional(),
  JIRA_TOKEN: z.string().optional(),
  JIRA_EMAIL: z.string().optional(),
  JIRA_PROJECTS: z.string().optional(), // comma-separated: "PROJ,TEAM"
  JIRA_INSECURE_TLS: z.string().optional(), // set to "true" for corporate CAs

  // Confluence Integration (Phase 3)
  CONFLUENCE_HOST: z.string().optional(),
  CONFLUENCE_TOKEN: z.string().optional(),
  CONFLUENCE_EMAIL: z.string().optional(),
  CONFLUENCE_SPACES: z.string().optional(), // comma-separated space keys

  // Dashboard thresholds
  PR_AGE_WARNING_DAYS: z.coerce.number().default(7),
})

export const env = envSchema.parse(process.env)
