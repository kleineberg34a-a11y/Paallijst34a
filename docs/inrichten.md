# Paallijst inrichten

Stappenplan om de paallijst in gebruik te nemen: Google Sheet en Apps Script in het huisaccount, publicatie via GitHub Pages en de tablet (Nokia T20).

Je hebt nodig: de inloggegevens van het huis-Gmailaccount (kleineberg34a@gmail.com), toegang tot de GitHub-repository `kleineberg34a-a11y/Paallijst34a` en de tablet.

## 1. Google Sheet

1. Log in op Google als **kleineberg34a@gmail.com**.
2. Ga naar [sheets.google.com](https://sheets.google.com) en maak een lege spreadsheet.
3. Noem hem **Paallijst Kleineberg**.

De tabbladen *Gebeurtenissen*, *Bewoners*, *Producten* en *Afsluitingen* maakt het script zelf aan zodra de eerste gegevens binnenkomen. Je hoeft er niets in te typen; pas de tabbladen ook niet met de hand aan.

## 2. Apps Script

1. Kies in de Sheet **Extensies → Apps Script**.
2. Verwijder de voorbeeldcode in `Code.gs` en plak de volledige inhoud van [`apps-script/Code.gs`](../apps-script/Code.gs) uit deze repository. Klik op **Opslaan**.
3. Kies links **Projectinstellingen** (tandwiel) → onderaan **Scripteigenschappen** → **Scripteigenschap toevoegen**:
   - Eigenschap: `SLEUTEL`
   - Waarde: een lange willekeurige tekst, bijvoorbeeld 30 tekens letters en cijfers door elkaar. Bewaar hem even; je hebt hem op de tablet nodig.
4. Kies rechtsboven **Implementeren → Nieuwe implementatie**:
   - Type (tandwiel): **Web-app**
   - Uitvoeren als: **Ik (kleineberg34a@gmail.com)**
   - Wie heeft toegang: **Iedereen**
   - Klik **Implementeren**.
5. Google vraagt toestemming (Sheets en Gmail). Kies het huisaccount → *Geavanceerd* → *Ga naar … (onveilig)* → **Toestaan**. Die waarschuwing hoort erbij, omdat het script niet door Google is gecontroleerd.
6. Kopieer de **web-app-URL** (eindigt op `/exec`).

**Na een wijziging in Code.gs:** plak de nieuwe code, sla op en kies **Implementeren → Implementaties beheren** → potlood bij de bestaande implementatie → Versie: **Nieuwe versie** → **Implementeren**. Zo blijft de URL gelijk en hoeft de tablet niets te veranderen.

Zonder de juiste sleutel weigert het script elk verzoek. Zet de sleutel en de URL nooit in de repository.

## 3. GitHub Pages

1. Open de repository op GitHub → **Settings → Pages**.
2. Bij *Build and deployment* → Source: **GitHub Actions**.
3. Na elke push naar `main` draait de workflow **Publiceren** (tabblad *Actions*). Die draait eerst de tests en zet daarna de map `app/` online.
4. De app staat dan op **https://kleineberg34a-a11y.github.io/Paallijst34a/**.

## 4. Tablet

1. Open **Chrome** op de tablet en ga naar het adres hierboven.
2. Menu (⋮) → **Toevoegen aan startscherm** → *Installeren*. Open de app daarna via het icoon op het startscherm (dan draait hij schermvullend).
3. Tik op **Instellingen** en voer de standaardpincode **0000** in.
4. Tabblad **Pincode & koppeling**:
   - Vul een nieuwe pincode van 4 cijfers twee keer in → **Pincode wijzigen**.
   - Plak de web-app-URL bij *Script-URL* en de sleutel bij *Sleutel* → **Opslaan en testen**. Er moet **Verbonden** verschijnen.
5. Tabblad **Bewoners**: voeg iedereen toe. Geef minstens één hoofdbewoner een mailadres en zet *Hoofdbewoner* aan; die kan de afsluitmail ontvangen.
6. Tabblad **Voorraad**: tel wat er in huis is en zet de voorraad per product goed → **Opslaan**.
7. Controleer in de Sheet dat het tabblad *Gebeurtenissen* binnen een minuut gevuld wordt.

### Eerste controle met de echte Sheet

- Streep iets → binnen 30 seconden staat het in *Gebeurtenissen*. **Nu synchroniseren** maakt geen dubbele rijen.
- **Afsluiten & mailen** naar een hoofdbewoner → de mail met CSV-bijlage komt aan vanaf het huisaccount, de CSV opent goed in Excel, de tellers staan op 0 en de voorraad is doorgelopen.
- Optioneel: wis in Chrome de sitegegevens van de app, open hem opnieuw, vul URL en sleutel weer in en kies **Herstellen vanuit Sheet** → de stand is terug.

## 5. Android

- **Scherm altijd aan:** *Instellingen → Display → Time-out scherm* op de langste waarde, of beter: zet de ontwikkelaarsopties aan (*Instellingen → Over de tablet → 7× op Buildnummer tikken*) en zet *Ontwikkelaarsopties → Stay awake / Actief blijven* aan. De tablet moet dan aan de lader.
- **App vastzetten:** *Instellingen → Beveiliging → App vastzetten* (of *Scherm vastzetten*) aanzetten. Open de Paallijst, open het overzicht van recente apps, tik op het icoon boven de Paallijst → **Vastzetten**. Losmaken gaat met *Terug* en *Overzicht* tegelijk ingedrukt houden.
- Zet de tablet op wifi en laat automatische updates van Chrome aan.

## 6. Updates

- Een nieuwe versie wordt na een push naar `main` automatisch gepubliceerd.
- Verhoog bij elke uitrol met gewijzigde bestanden het versienummer in `app/sw.js` (`paallijst-v1` → `paallijst-v2`, enzovoort). Anders blijft de tablet de oude versie uit zijn cache tonen.
- Op de tablet: open de app, sluit hem en open hem opnieuw. De service worker haalt de nieuwe versie bij de eerste keer op en toont hem de tweede keer.
