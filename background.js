// Background script for Text Refiner extension
console.log('Text Refiner: Background script loaded');

// Ensure the service worker stays alive
chrome.runtime.onStartup.addListener(() => {
  console.log('Text Refiner: Extension startup');
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log('Text Refiner: Extension installed/updated', details);
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Text Refiner: Message received from content script:', request);
  
  if (request.action === "refineText") {
    console.log('Text Refiner: Processing text refinement for:', request.text);
    console.log('Text Refiner: Using option:', request.option);
    
    // Handle the request asynchronously
    handleRefineRequest(request, sendResponse);
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  // For other messages, send a default response
  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

async function handleRefineRequest(request, sendResponse) {
  try {
    const refinedText = await refineTextWithGPT(request.text, request.option);
    console.log('Text Refiner: Text refinement successful:', refinedText);
    sendResponse({ success: true, refinedText });
  } catch (error) {
    console.error("Text Refiner: Error refining text:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function refineTextWithGPT(text, option) {
  console.log('Text Refiner: Starting GPT refinement for text:', text);
  console.log('Text Refiner: Using prompt:', option.prompt);
  
  // Get API key from storage
  const result = await chrome.storage.sync.get(['openaiApiKey']);
  const apiKey = result.openaiApiKey;
  
  console.log('Text Refiner: API key retrieved:', apiKey ? 'Present' : 'Missing');
  
  if (!apiKey) {
    throw new Error("OpenAI API key not set. Please configure it in the extension popup.");
  }

  const requestBody = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `${option.prompt} Return only the refined text without any additional commentary, explanations, or formatting.`
      },
      {
        role: 'user',
        content: text
      }
    ],
    max_tokens: 1000,
    temperature: 0.3
  };

  console.log('Text Refiner: Sending request to OpenAI:', requestBody);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  console.log('Text Refiner: OpenAI response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json();
    console.error('Text Refiner: OpenAI API error:', errorData);
    throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('Text Refiner: OpenAI response data:', data);
  
  const refinedText = data.choices[0].message.content.trim();
  console.log('Text Refiner: Final refined text:', refinedText);
  
  return refinedText;
}

// Keep the service worker alive
self.addEventListener('message', (event) => {
  console.log('Text Refiner: Service worker message received');
}); 