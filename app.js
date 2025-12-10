// --- CONFIGURATION ---
// IMPORTANT: This must match the name of the file you created.
const TARGET_FILE_NAME = 'target.txt'; 
// Set the confidence threshold (0.0 to 1.0). You wanted it LOW.
// 0.3 means only 30% certainty is required for a 'CORRECT' match.
const CONFIDENCE_THRESHOLD = 0.30; 

// --- VOSK MODEL SETUP ---
// You will need to download and host a small Vosk model.
// For testing, we use a placeholder model name. You must add the model file later.
const MODEL_NAME = 'https://raw.githubusercontent.com/IginaeHuxley/IginaeHuxley_vosk_speech_model/main/vosk-model-small-en-us-0.15';
const SAMPLE_RATE = 16000;

// --- GLOBAL VARIABLES ---
let recognizer;
let currentTargetIndex = 0;
let targets = [];
let audioContext;
let mediaStream;
let processor;

// --- DOM ELEMENTS ---
const startButton = document.getElementById('start-btn');
const nextButton = document.getElementById('next-btn');
const imageDisplay = document.getElementById('image-display');
const promptText = document.getElementById('prompt-text');
const feedbackArea = document.getElementById('feedback-area');
const transcriptArea = document.getElementById('transcript-area');

// --- INITIALIZATION ---

// 1. Load the list of targets from the file you created
async function loadTargets() {
    try {
        const response = await fetch(TARGET_FILE_NAME);
        if (!response.ok) {
            throw new Error(`Could not find ${TARGET_FILE_NAME}. Did you name it correctly?`);
        }
        const text = await response.text();
        const lines = text.trim().split('\n');
        
        targets = lines.map(line => {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length === 4) {
                return {
                    key: parts[0],
                    display: parts[1],
                    path: parts[2],
                    category: parts[3]
                };
            }
            return null; // Ignore malformed lines
        }).filter(item => item !== null);

        if (targets.length === 0) {
            promptText.textContent = "Error: Targets file is empty or formatted incorrectly.";
            return;
        }

        promptText.textContent = `Loaded ${targets.length} targets. Click Start.`;
        nextButton.disabled = false; // Enable navigation

    } catch (error) {
        console.error("Target loading error:", error);
        promptText.textContent = `Target Error: ${error.message}. Check console.`;
    }
}

// 2. Set up the Vosk Recognizer with a custom grammar list
function setupRecognizer() {
    if (targets.length === 0) return;

    // Create a simplified list of just the words/keys for grammar restriction
    // This is the core of the low-sensitivity magic!
    const grammarList = targets.map(t => t.key.toLowerCase().split('_').join(' ')); 
    
    // Vosk needs the grammar in a specific JSON format
    const grammar = {
        'start': 'root',
        'root': grammarList.join(' | ')
    };
    
    // Initialize the Vosk Recognizer
    recognizer = new Vosk.Recognizer({ 
        model: MODEL_NAME, 
        sampleRate: SAMPLE_RATE,
        grammar: JSON.stringify(grammar) // Applying the vocabulary restriction
    });

    // Handle the final result from the recognition
    recognizer.onfinalresult = (result) => {
        const finalResult = JSON.parse(result);
        if (finalResult.text) {
            checkResult(finalResult);
        }
        stopRecognition(); // Stop after a final result
    };
    
    // Display partial results to the user
    recognizer.onpartialresult = (partial) => {
        transcriptArea.textContent = JSON.parse(partial).partial;
    };
}

// 3. Logic to check the recognition result against the target
function checkResult(result) {
    const recognizedText = result.text.toLowerCase().trim();
    const targetKey = targets[currentTargetIndex].key.toLowerCase().trim().split('_').join(' ');
    
    // Find the best alternative result that Vosk provides
    let bestAlternative = result.alternatives ? result.alternatives[0] : null;

    if (!bestAlternative) {
        feedbackArea.textContent = "❌ Failed to recognize speech.";
        feedbackArea.style.color = 'red';
        return;
    }

    const recognizedWord = bestAlternative.text.toLowerCase().trim();
    const confidence = bestAlternative.conf || 0; // Confidence score (0 to 1)

    // Log for debugging the low-sensitivity setting
    console.log(`Target: ${targetKey}, Recognized: ${recognizedWord}, Confidence: ${confidence.toFixed(2)}`);

    // --- LOW SENSITIVITY CHECK (The Compassionate Logic) ---
    // 1. Check if the recognized word matches the target key.
    // 2. Check if the confidence score meets the low threshold (e.g., 0.30).
    const isCorrect = (recognizedWord === targetKey) && (confidence >= CONFIDENCE_THRESHOLD);

    if (isCorrect) {
        feedbackArea.textContent = `✅ CORRECT! (Confidence: ${Math.round(confidence * 100)}%)`;
        feedbackArea.style.color = 'green';
    } else {
        feedbackArea.textContent = `❌ TRY AGAIN. (Heard: "${recognizedWord}", Confidence: ${Math.round(confidence * 100)}%)`;
        feedbackArea.style.color = 'red';
    }

    transcriptArea.textContent = `Recognition Complete.`;
}

// 4. Update the display with the next target
function updateTarget() {
    if (targets.length === 0) return;

    const target = targets[currentTargetIndex];
    imageDisplay.src = target.path; // Set the image source
    promptText.textContent = target.display; // Set the text prompt
    feedbackArea.textContent = '';
    transcriptArea.textContent = 'Click "Start Recognition" when ready.';
    startButton.disabled = false; // Re-enable the start button
}

// --- MICROPHONE AND PROCESSING HANDLERS ---

async function startRecognition() {
    if (!recognizer) {
        feedbackArea.textContent = "Initializing recognizer... Please wait.";
        setupRecognizer();
        return;
    }

    try {
        startButton.disabled = true;
        feedbackArea.textContent = '... LISTENING ...';
        feedbackArea.style.color = 'blue';

        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // Create an AudioWorkletProcessor to feed audio data to Vosk
        // This is a complex part that requires a separate worker to be fully robust
        // For simplicity here, we use a basic ScriptProcessorNode if available
        
        processor = audioContext.createScriptProcessor(1024, 1, 1);
        processor.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0);
            recognizer.acceptWaveform(data); // Send data to Vosk
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        recognizer.reset(); // Clear any previous speech data

    } catch (e) {
        startButton.disabled = false;
        feedbackArea.textContent = `Mic Error: ${e.name}. Ensure mic is connected and permissions are granted.`;
        feedbackArea.style.color = 'red';
        console.error("Microphone access failed:", e);
    }
}

function stopRecognition() {
    startButton.disabled = false;
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
    }
    if (processor) {
        processor.disconnect();
    }
    if (audioContext) {
        audioContext.close();
    }
}

function nextTarget() {
    currentTargetIndex = (currentTargetIndex + 1) % targets.length;
    updateTarget();
}

// --- EVENT LISTENERS ---
startButton.addEventListener('click', startRecognition);
nextButton.addEventListener('click', nextTarget);

// --- START THE APP ---
window.addEventListener('load', () => {
    // 1. Load targets immediately
    loadTargets().then(() => {
        // 2. Set the initial target display
        updateTarget();
    });
});
