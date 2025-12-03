/*
This is the required Vosk Web Worker script.
*/
importScripts('vosk-browser.js');

let model;
let recognizer;

onmessage = function(event) {
    const { command, callbackId, model: modelName, sampleRate, data, words, grammar, recognitionParams } = event.data;

    switch (command) {
        case 'initialize':
            Vosk.setLogLevel('error');
            Vosk.Model(modelName).then(m => {
                model = m;
                recognizer = new model.Recognizer({ sampleRate });
                // If model is not found, post a message with an error
                if (!model) {
                    postMessage({ callbackId, error: 'Model initialization failed' });
                }
            }).catch(e => {
                postMessage({ callbackId, error: `Initialization error: ${e}` });
            });
            break;

        case 'process':
            if (recognizer) {
                const results = recognizer.acceptWaveform(data);
                if (results) {
                    postMessage({ callbackId, result: results });
                }
            }
            break;

        case 'setWords':
            if (recognizer && words) {
                recognizer.setWords(words);
            }
            break;

        case 'setGrammar':
            if (recognizer && grammar) {
                recognizer.setGrammar(grammar);
            }
            break;

        case 'setRecognitionParams':
            if (recognizer && recognitionParams) {
                // Not standard in basic Vosk, but a placeholder for advanced features
            }
            break;

        case 'reset':
            if (recognizer) {
                recognizer.reset();
            }
            break;

        case 'terminate':
            if (recognizer) {
                recognizer.terminate();
            }
            self.close();
            break;
    }
};
