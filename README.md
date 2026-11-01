# Diario Yaz

App Android per chi prende Yaz (24 compresse attive e 4 placebo). Tiene il conto dei giorni del blister, prevede il ciclo e manda i promemoria con i pulsanti di risposta dentro la notifica. I dati restano sul telefono.

## Cosa fa

Il calendario mostra compresse attive, placebo, ciclo previsto (il giorno 28, con l'ultima placebo) e cicli saltati. Sotto c'è l'elenco dei prossimi cicli, calcolati supponendo che tu prenda tutte le placebo.

Il giorno 25 la notifica chiede "Oggi cominci a prendere le placebo oppure cominci un nuovo blister?". Se rispondi con il pulsante Blister nuovo, il conteggio riparte da quel giorno e l'app segna che quel mese il ciclo salta. A fine blister arriva "Hai cominciato un nuovo blister oggi?": con No la domanda torna il giorno dopo.

Altri avvisi arrivano il giorno del ciclo previsto e il giorno in cui un ciclo saltato sarebbe arrivato. Ogni due blister, il giorno 21, l'app ricorda di chiedere la ricetta al medico di base; se il promemoria cade nel blister sbagliato, lo sposti a quello accanto dalle Impostazioni. Lì scegli anche l'orario dei promemoria e copi o incolli un backup dei dati quando cambi telefono.

## Dati e notifiche

I dati stanno nelle preferenze di Android: restano se chiudi l'app o riavvii il telefono e spariscono solo se la disinstalli.

Le notifiche sono locali, senza server e senza connessione. L'app calcola i promemoria dei 100 giorni successivi e li affida alle sveglie di Android, che li mostrano anche ad app chiusa. Dopo un riavvio il plugin delle notifiche li riprogramma. Ogni apertura dell'app ricalcola l'elenco, quindi i promemoria finiscono solo se non la apri per più di tre mesi.

Su Android 14 e successivi i promemoria possono arrivare con qualche minuto di ritardo finché non premi Consenti alla voce "Orario esatto" nelle Impostazioni dell'app.

## APK da GitHub

A ogni push su `main` il workflow `.github/workflows/build-apk.yml` esegue i test, compila l'APK di release e lo pubblica nelle Releases del repository come `diario-yaz-N.apk`, dove N è il numero della build. Si può avviare anche a mano da Actions › Build APK › Run workflow. Una build dura circa quattro minuti.

Il repository è privato: per scaricare l'APK dal telefono serve l'accesso a GitHub nel browser. All'apertura del file Android chiede il permesso di installare app da quel browser, e Play Protect può segnalare l'app come sconosciuta perché non arriva dal Play Store.

Ogni versione si installa sopra la precedente senza perdere i dati: la chiave di firma è sempre la stessa e il numero di versione cresce con la build.

## Sviluppo

Servono Node.js 22, JDK 21 e l'SDK Android, che si installa con Android Studio. Capacitor 8 compila per Java 21: con `JAVA_HOME` su Java 17 Gradle si ferma.

```bash
npm install      # una volta sola
npm test         # test dei calcoli sulle date
npm run build    # crea www/; aprendo www/index.html vedi l'interfaccia nel browser, senza notifiche
npm run sync     # build e copia di www/ nel progetto Android
npm run open     # apre android/ in Android Studio
```

Dopo ogni modifica in `src/` lancia `npm run sync`, poi in Android Studio premi Run ▶ con il telefono collegato via USB (debug USB attivo) o con un emulatore.

Senza Android Studio, l'APK di debug si compila con `npm run apk` su macOS e Linux. Su Windows npm esegue gli script con `cmd`, che non riconosce `./gradlew`, quindi da PowerShell:

```powershell
$env:JAVA_HOME = "C:\percorso\del\jdk-21"
npm run sync
cd android; .\gradlew.bat assembleDebug
```

Il file finisce in `android/app/build/outputs/apk/debug/app-debug.apk`. Con il telefono collegato lo installi con `adb install -r` seguito dal percorso (`adb` è nella cartella `platform-tools` dell'SDK); `-r` sostituisce la versione installata e conserva i dati.

Una build locale ha numero di versione 1, e Android non la installa sopra una versione scaricata da GitHub, che ha un numero più alto. Per provarla su un telefono che ha già l'app da GitHub bisogna disinstallare l'app, dopo aver fatto un backup, oppure usare un emulatore.

### Struttura

| Percorso | Contenuto |
|---|---|
| `src/logic.js` | Calcoli: giorno del blister, placebo, cicli previsti e saltati, ricetta, programma delle notifiche, risposte |
| `src/app.js` | Interfaccia, salvataggio sul telefono, notifiche e pulsanti |
| `src/index.html`, `src/styles.css` | Pagina e stile (colori in cima al CSS, tema chiaro e scuro) |
| `scripts/test-logic.mjs` | Test dei calcoli (`npm test`) |
| `scripts/build.mjs` | Crea la cartella `www/` che va nell'app |
| `assets/` | Icona e schermata di avvio (si rigenerano con `npm run icons`) |
| `android/` | Progetto Android generato da Capacitor |
| `.github/workflows/build-apk.yml` | Build dell'APK su GitHub |

### Firma

`android/app/diario-yaz.keystore` firma sia le build di debug sia quelle di release. La password (`diarioyaz`) è scritta in `android/app/build.gradle`, ed è il motivo per cui il repository deve restare privato. Se la chiave cambia, Android rifiuta l'aggiornamento: l'app va disinstallata e i dati si perdono, a meno di averne fatto un backup.

## Tecnologia

L'app usa [Capacitor 8](https://capacitorjs.com): l'interfaccia in HTML, CSS e JavaScript gira dentro un'app Android nativa. I plugin sono `@capacitor/preferences` per il salvataggio, `@capacitor/local-notifications` per i promemoria con i pulsanti e `@capacitor/app` per aggiornare la pagina quando l'app torna in primo piano. I font sono inclusi, così l'app funziona anche offline.

Le previsioni non sostituiscono le indicazioni del medico o del foglietto illustrativo.
