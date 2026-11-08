// Twin SMP – Bewerbungsseite: Verbindung zu Supabase.
// Leer lassen = Demo-Modus (alles nur im eigenen Browser gespeichert, Admin-Passwort "demo").
// Der "anon"/"publishable" Key ist absichtlich öffentlich – geschützt wird über die Regeln in supabase/schema.sql.
window.TWIN_CONFIG = {
  // Discord-Webhook: Bewerbungen landen als Nachricht in deinem Discord-Kanal (kein Chat auf der Seite).
  discordWebhook: "",
  // Der Webhook liegt kodiert hier, weil Discord Webhook-Adressen im Klartext in öffentlichen GitHub-Repos automatisch löscht.
  discordWebhookEnc: "VjZQNWhKMEg3X0FZS0hqUEQwbTc5ZkRvbHV0VXdhV2VGYUR0bGlVWEgtRXpTNWtmQi1QOHRUYkpoMEwybEFnUXZ3TUMvMjg5ODQ4NTM1MDI2MDMwOTY1MS9za29vaGJldy9pcGEvbW9jLmRyb2NzaWQvLzpzcHR0aA==",
  // Optional statt Discord: Supabase (Chat + Admin-Bereich auf der Seite), siehe README.
  supabaseUrl: "",
  supabaseAnonKey: "",
  adminEmail: "",          // E-Mail des Admin-Kontos in Supabase (auf der Seite wird nur das Passwort abgefragt)
  discordInvite: "https://discord.gg/M9KbfPg3w2",
  serverAddress: "stamina-smc.tun.ply.gg",
};
