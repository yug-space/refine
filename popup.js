// Popup script for managing API key and custom prompts
console.log('Text Refiner: Popup script loaded');

let isEditing = false;
let editingPromptId = null;

document.addEventListener('DOMContentLoaded', function() {
  console.log('Text Refiner: DOM content loaded');
  
  const apiKeyInput = document.getElementById('apiKey');
  const saveButton = document.getElementById('saveKey');
  const statusDiv = document.getElementById('status');
  const addPromptBtn = document.getElementById('addPromptBtn');
  const addPromptForm = document.getElementById('addPromptForm');
  const promptNameInput = document.getElementById('promptName');
  const promptTextInput = document.getElementById('promptText');
  const savePromptBtn = document.getElementById('savePrompt');
  const cancelPromptBtn = document.getElementById('cancelPrompt');
  const customPromptsList = document.getElementById('customPromptsList');
  
  console.log('Text Refiner: Elements found:', { apiKeyInput, saveButton, statusDiv });
  
  // Load existing API key
  chrome.storage.sync.get(['openaiApiKey'], function(result) {
    console.log('Text Refiner: Storage result:', result);
    if (result.openaiApiKey) {
      apiKeyInput.value = result.openaiApiKey;
      console.log('Text Refiner: API key loaded from storage');
      showStatus('API key loaded', 'success');
    } else {
      console.log('Text Refiner: No API key found in storage');
    }
  });
  
  // Load custom prompts
  loadCustomPrompts();
  
  // Save API key
  saveButton.addEventListener('click', function() {
    console.log('Text Refiner: Save button clicked');
    const apiKey = apiKeyInput.value.trim();
    
    console.log('Text Refiner: API key to save:', apiKey ? 'Present' : 'Empty');
    
    if (!apiKey) {
      console.log('Text Refiner: Empty API key');
      showStatus('Please enter an API key', 'error');
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      console.log('Text Refiner: Invalid API key format');
      showStatus('Invalid API key format', 'error');
      return;
    }
    
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    console.log('Text Refiner: Saving API key to storage');
    
    chrome.storage.sync.set({ openaiApiKey: apiKey }, function() {
      saveButton.disabled = false;
      saveButton.textContent = 'Save API Key';
      
      if (chrome.runtime.lastError) {
        console.error('Text Refiner: Error saving API key:', chrome.runtime.lastError);
        showStatus('Error saving API key', 'error');
      } else {
        console.log('Text Refiner: API key saved successfully');
        showStatus('API key saved successfully!', 'success');
      }
    });
  });
  
  // Handle Enter key in API key input
  apiKeyInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      console.log('Text Refiner: Enter key pressed in API key input');
      saveButton.click();
    }
  });
  
  // Add prompt button
  addPromptBtn.addEventListener('click', function() {
    showAddPromptForm();
  });
  
  // Save prompt button
  savePromptBtn.addEventListener('click', function() {
    saveCustomPrompt();
  });
  
  // Cancel prompt button
  cancelPromptBtn.addEventListener('click', function() {
    hideAddPromptForm();
  });
  
  function showAddPromptForm() {
    addPromptForm.classList.add('show');
    addPromptBtn.style.display = 'none';
    promptNameInput.focus();
    
    if (isEditing) {
      savePromptBtn.textContent = 'Update Prompt';
    } else {
      savePromptBtn.textContent = 'Save Prompt';
      promptNameInput.value = '';
      promptTextInput.value = '';
    }
  }
  
  function hideAddPromptForm() {
    addPromptForm.classList.remove('show');
    addPromptBtn.style.display = 'block';
    promptNameInput.value = '';
    promptTextInput.value = '';
    isEditing = false;
    editingPromptId = null;
  }
  
  function saveCustomPrompt() {
    const name = promptNameInput.value.trim();
    const text = promptTextInput.value.trim();
    
    if (!name || !text) {
      showStatus('Please fill in both name and prompt text', 'error');
      return;
    }
    
    chrome.storage.sync.get(['customPrompts'], function(result) {
      const customPrompts = result.customPrompts || [];
      
      if (isEditing && editingPromptId) {
        // Update existing prompt
        const index = customPrompts.findIndex(p => p.id === editingPromptId);
        if (index !== -1) {
          customPrompts[index] = {
            ...customPrompts[index],
            name: name,
            prompt: text
          };
        }
      } else {
        // Add new prompt
        const newPrompt = {
          id: Date.now().toString(),
          name: name,
          prompt: text,
          icon: '🎯' // Default icon
        };
        customPrompts.push(newPrompt);
      }
      
      chrome.storage.sync.set({ customPrompts: customPrompts }, function() {
        if (chrome.runtime.lastError) {
          showStatus('Error saving prompt', 'error');
        } else {
          showStatus(isEditing ? 'Prompt updated!' : 'Prompt saved!', 'success');
          hideAddPromptForm();
          loadCustomPrompts();
        }
      });
    });
  }
  
  function loadCustomPrompts() {
    chrome.storage.sync.get(['customPrompts'], function(result) {
      const customPrompts = result.customPrompts || [];
      displayCustomPrompts(customPrompts);
    });
  }
  
  function displayCustomPrompts(prompts) {
    if (prompts.length === 0) {
      customPromptsList.innerHTML = '<div class="no-prompts">No custom prompts yet. Create your first one!</div>';
      return;
    }
    
    customPromptsList.innerHTML = prompts.map(prompt => `
      <div class="custom-prompt" data-id="${prompt.id}">
        <div class="custom-prompt-name">${prompt.icon} ${prompt.name}</div>
        <div class="custom-prompt-text">${prompt.prompt}</div>
        <div class="custom-prompt-actions">
          <button onclick="editPrompt('${prompt.id}')" class="button-secondary">Edit</button>
          <button onclick="deletePrompt('${prompt.id}')" class="button-danger">Delete</button>
        </div>
      </div>
    `).join('');
  }
  
  // Make functions global so they can be called from onclick
  window.editPrompt = function(promptId) {
    chrome.storage.sync.get(['customPrompts'], function(result) {
      const customPrompts = result.customPrompts || [];
      const prompt = customPrompts.find(p => p.id === promptId);
      
      if (prompt) {
        isEditing = true;
        editingPromptId = promptId;
        promptNameInput.value = prompt.name;
        promptTextInput.value = prompt.prompt;
        showAddPromptForm();
      }
    });
  };
  
  window.deletePrompt = function(promptId) {
    if (confirm('Are you sure you want to delete this custom prompt?')) {
      chrome.storage.sync.get(['customPrompts'], function(result) {
        const customPrompts = result.customPrompts || [];
        const filteredPrompts = customPrompts.filter(p => p.id !== promptId);
        
        chrome.storage.sync.set({ customPrompts: filteredPrompts }, function() {
          if (chrome.runtime.lastError) {
            showStatus('Error deleting prompt', 'error');
          } else {
            showStatus('Prompt deleted', 'success');
            loadCustomPrompts();
          }
        });
      });
    }
  };
  
  function showStatus(message, type) {
    console.log('Text Refiner: Showing status:', { message, type });
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        console.log('Text Refiner: Hiding success status');
        statusDiv.style.display = 'none';
      }, 3000);
    }
  }
}); 