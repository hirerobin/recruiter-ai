export interface JobRecord {
  judul_job: string
  lokasi: string
  deskripsi: string
  client: string
  requirement: {
    age: string        // e.g. "25-40"
    jenis_sim: string  // e.g. "B1", "C", or ""
    pendidikan: string // e.g. "SMA/SMK", "D3/S1"
  }
  role: string
  benefit: string
  post_test: string
  recruiter_name: string
  recruitment_number: string
}
