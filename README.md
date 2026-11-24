# MetroQuadro

Versione **0.2.1**. Ordina gli annunci caricati su Idealista e Immobiliare.it per €/m².

## Installa una volta

1. Installa [Tampermonkey dal Chrome Web Store](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
2. In `chrome://extensions` → Tampermonkey → Dettagli, abilita **Consenti script utente / Allow User Scripts**, se richiesto. [Guida ufficiale](https://www.tampermonkey.net/faq.php?q=Q209).
3. Apri [Installa MetroQuadro](https://raw.githubusercontent.com/asia-volta/metroquadro-userscript/main/metroquadro.user.js) e conferma nel gestore. Se Chrome mostra soltanto il testo, in Tampermonkey → Dashboard → Utilità → **Installa da URL** incolla lo stesso collegamento.
4. In Tampermonkey → Impostazioni → Aggiornamenti script, abilita il controllo e **Installazione automatica / Automatic installation** (la posizione e la lingua delle voci possono variare).
5. Disattiva l'eventuale vecchia estensione MetroQuadro caricata come cartella, quindi ricarica una ricerca.

## Aggiornamenti

Lo script controlla la versione tramite il gestore userscript. Non occorre reinstallarlo dopo ogni rilascio. I controlli sono periodici, secondo l'intervallo configurato nel gestore; non sono un push istantaneo. Per anticiparli usa **Controlla aggiornamenti script**, poi ricarica le schede già aperte. Il nome e il namespace restano stabili.

La pipeline verifica il codice prima di pubblicarlo. Questo repository contiene solo i file distribuibili; sviluppo e test rimangono privati. Il codice dello script è pubblico e non contiene credenziali o dati personali.

## Uso e limiti

Nel pannello scegli €/m² crescente, decrescente o l'ordine del sito. La scelta viene salvata dal gestore sul dispositivo. Il rapporto usa prezzo e superficie dichiarati; dati mancanti o ambigui vanno in fondo. Si ordinano **solo le schede caricate nella pagina**, separatamente per sezione. Su Idealista sono presenti anche i collegamenti all'ordinamento nativo dell'intera ricerca.

Nessuna telemetria o chiamata ai portali da parte dello script. Il gestore contatta GitHub per gli aggiornamenti e può sincronizzare le preferenze soltanto se abiliti tu la sua funzione di sincronizzazione.

Test automatici eseguiti su pagine sintetiche. I layout reali dei portali possono cambiare; il collaudo sul browser personale e l'aggiornamento effettivo del gestore vanno verificati dopo l'installazione.
