# Twin SMP – Bewerbungsseite

Statische Webseite (GitHub Pages) zum Bewerben für das Twin SMP.

- **Bewerber** brauchen kein Konto. Sie füllen den Bogen aus, landen direkt in ihrem Chat und bekommen einen geheimen Link, um später zurückzukommen. Der Link wird im Browser gemerkt.
- **Admins** öffnen `…/#admin` (Link „Team“ unten auf der Seite), geben das Admin-Passwort ein und sehen alle Bewerbungen. Sie können antworten, den Status setzen (Neu / In Prüfung / Angenommen / Abgelehnt) und Bewerbungen löschen.
- Ohne Einrichtung läuft die Seite im **Demo-Modus**: Alles bleibt im eigenen Browser, das Admin-Passwort ist `demo`.

## Einrichtung (einmalig, kostenlos)

### 1. Supabase-Projekt anlegen
1. Konto auf <https://supabase.com> erstellen und **New project** anlegen. Region am besten *Central EU (Frankfurt)*.
2. Links **SQL Editor** öffnen, den kompletten Inhalt von `supabase/schema.sql` einfügen und **Run** klicken.

### 2. Admin-Konto anlegen
1. **Authentication → Users → Add user → Create new user**: E-Mail und **Admin-Passwort** eintragen, „Auto Confirm User“ anhaken.
2. Im **SQL Editor** diese Zeile ausführen, mit deiner E-Mail:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'DEINE-ADMIN@MAIL.de';
   ```
3. Empfohlen: **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten**. Fremde Konten hätten ohne Eintrag in `admins` zwar keinen Zugriff, aber so ist es sauberer.

### 3. Seite verbinden
**Project Settings → API**: *Project URL* und den *anon / publishable key* kopieren und in `config.js` eintragen:

```js
window.TWIN_CONFIG = {
  supabaseUrl: "https://xxxx.supabase.co",
  supabaseAnonKey: "eyJ…",
  adminEmail: "DEINE-ADMIN@MAIL.de",
  serverAddress: "stamina-smc.tun.ply.gg",
};
```

Der anon-Key darf öffentlich sein. Geschützt wird alles über die Regeln in `schema.sql`:
- Fremde kommen nicht an die Tabellen.
- Bewerber lesen und schreiben nur ihren eigenen Chat, über ID und geheimes Token.
- Nur eingetragene Admins sehen alles.

### 4. Auf GitHub Pages veröffentlichen
Repository anlegen, Dateien hochladen und unter **Settings → Pages** als Quelle `main` / `/ (root)` wählen. Die Seite liegt dann unter `https://<name>.github.io/<repo>/`.

## Fragen im Bewerbungsbogen
1. Minecraft-Name, Discord-Name und/oder E-Mail, Alter
2. Spielzeit pro Woche, Discord-Aktivität, Spielstil (Mehrfachauswahl), Edition und Version
3. Umgang mit Verrat (Masken-Szenario), Einstellung zu PvP, optionale erste Nachricht

Fragen ändern: `index.html` (Formular) und `LABELS` in `app.js` (Anzeige im Chat und im Admin-Bereich). Die Antworten werden flexibel als JSON gespeichert, am Datenbank-Schema muss dafür nichts geändert werden.

## Dateien
| Datei | Inhalt |
|---|---|
| `index.html` | Seite (Start, Bewerbung, Chat, Admin) |
| `style.css` | Design (Twin-SMP-Farben, Pixel-Kanten) |
| `app.js` | Logik, Supabase- und Demo-Backend |
| `config.js` | Verbindungsdaten |
| `supabase/schema.sql` | Datenbank, Zugriffsregeln, Funktionen |
| `assets/` | Logo und Favicon |
