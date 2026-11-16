// Dynamische, schreibgeschützte Buchliste aus Airtable.
// Der geheime Token steht NUR in der Netlify-Umgebungsvariablen AIRTABLE_TOKEN.
// Achtung: Nur über Git-Deploy oder Netlify CLI deployen, nicht über Netlify Drop.
const BASE = 'appvsoCpeYAmmVl55';
const TABLE = 'Bücher';
const MAX_PAGES = 20; // maximal 2.000 Titel, Schutz gegen Endlosschleifen

export default async function handler(request) {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET' } });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    return Response.json({ error: 'Die Airtable-Verbindung ist noch nicht eingerichtet.' }, { status: 503 });
  }

  try {
    const titel = [];
    let offset = null;
    let seite = 0;
    do {
      const adresse = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`);
      adresse.searchParams.set('pageSize', '100');
      adresse.searchParams.append('fields[]', 'Name');
      if (offset) adresse.searchParams.set('offset', offset);
      const antwort = await fetch(adresse, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!antwort.ok) {
        console.error('Airtable-Fehler beim Lesen der Bücher:', antwort.status);
        return Response.json({ error: 'Die Bücher konnten gerade nicht geladen werden.' }, { status: 502 });
      }
      const daten = await antwort.json();
      for (const eintrag of (daten.records ?? [])) {
        const name = eintrag?.fields?.Name;
        if (typeof name === 'string' && name.trim()) titel.push(name.trim());
      }
      offset = daten.offset ?? null;
      seite++;
    } while (offset && seite < MAX_PAGES);

    const books = [...new Set(titel)].sort((a,b) => a.localeCompare(b,'de'));
    return Response.json({ books }, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
    });
  } catch (fehler) {
    console.error('Fehler bei der Airtable-Buchauswahl:', fehler?.message);
    return Response.json({ error: 'Die Bücherliste ist vorübergehend nicht erreichbar.' }, { status: 502 });
  }
}
