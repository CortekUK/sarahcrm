// Shapes shared by the directory API routes and the portal Network page.

// A wider-network (CRM) contact as a member may see it — nothing more.
export interface DirectoryContact {
  id: string
  name: string
  company: string | null
  role: string | null
  sectorLabel: string | null
  requested: boolean // the viewer has a pending/approved request for them
}

export interface DirectoryContactsPage {
  contacts: DirectoryContact[]
  nextCursor: string | null
}

export interface DirectorySector {
  key: string
  label: string
  count: number
}

export type ContactIntroStatus = 'pending' | 'approved' | 'declined' | 'completed'
