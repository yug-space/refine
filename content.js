// Text Refiner Content Script
console.log('Text Refiner: Content script loaded');

let currentSelection = null;
let currentElement = null;
let refineButton = null;
let refineMenu = null;
let overlay = null;
let customPrompts = [];
let isButtonActive = false; // Flag to prevent interference
let storedTextData = null; // Store text data per site
let extensionContextValid = true; // Track extension context

// Default refine options
const defaultRefineOptions = [
  {
    id: 'rephrase',
    icon: '🔄',
    text: 'Rephrase',
    prompt: 'Rephrase the following text to make it clearer and more engaging while maintaining the same meaning:'
  },
  {
    id: 'shorten',
    icon: '✂️',
    text: 'Shorten',
    prompt: 'Make the following text more concise and brief while keeping the key information:'
  },
  {
    id: 'elaborate',
    icon: '📝',
    text: 'Elaborate',
    prompt: 'Expand and elaborate on the following text with more detail and explanation:'
  },
  {
    id: 'formal',
    icon: '👔',
    text: 'More formal',
    prompt: 'Rewrite the following text in a more formal and professional tone:'
  },
  {
    id: 'grammar',
    icon: '✅',
    text: 'Fix grammar',
    prompt: 'Correct the grammar and improve the clarity of the following text while maintaining its original meaning:'
  }
];

// Check extension context validity
function checkExtensionContext() {
  try {
    // Test multiple ways to check extension validity
    if (chrome && chrome.runtime && chrome.runtime.id) {
      // Try to access a basic chrome.runtime property
      chrome.runtime.getManifest();
      extensionContextValid = true;
      return true;
    }
  } catch (error) {
    extensionContextValid = false;
    console.warn('Text Refiner: Extension context is invalid:', error.message);
    
    // Show user-friendly message for context invalidation
    if (error.message.includes('Extension context invalidated')) {
      console.warn('Text Refiner: Extension was reloaded - content script needs refresh');
    }
  }
  return false;
}

// Load custom prompts from storage
function loadCustomPrompts() {
  if (!checkExtensionContext()) {
    console.warn('Text Refiner: Cannot load custom prompts - extension context invalid');
    return;
  }
  
  try {
    chrome.storage.sync.get(['customPrompts'], function(result) {
      if (chrome.runtime.lastError) {
        console.warn('Text Refiner: Error loading custom prompts:', chrome.runtime.lastError.message);
        return;
      }
      customPrompts = result.customPrompts || [];
      console.log('Text Refiner: Loaded custom prompts:', customPrompts.length, 'prompts');
    });
  } catch (error) {
    console.warn('Text Refiner: Failed to load custom prompts:', error.message);
    extensionContextValid = false;
  }
}

// Get all refine options (default + custom)
function getAllRefineOptions() {
  return [...defaultRefineOptions, ...customPrompts];
}

// Load custom prompts when script loads
loadCustomPrompts();

// Listen for storage changes to update custom prompts
if (checkExtensionContext()) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.customPrompts) {
      customPrompts = changes.customPrompts.newValue || [];
      console.log('Text Refiner: Custom prompts updated:', customPrompts);
    }
  });
}

// Listen for text selection with a delay to ensure selection is complete
document.addEventListener('mouseup', (e) => {
  // Don't process if clicking on our button or menu
  if (isButtonActive || 
      (refineButton && refineButton.contains(e.target)) ||
      (refineMenu && refineMenu.contains(e.target)) ||
      (overlay && overlay.contains(e.target))) {
    console.log('Text Refiner: Ignoring mouseup on refine UI elements');
    return;
  }
  setTimeout(handleTextSelection, 100);
});

document.addEventListener('keyup', () => {
  if (!isButtonActive) {
    setTimeout(handleTextSelection, 100);
  }
});

// Also listen for selection change events
document.addEventListener('selectionchange', () => {
  if (!isButtonActive) {
    setTimeout(handleTextSelection, 100);
  }
});

// Listen for clicks to hide menu (but not button)
document.addEventListener('click', (e) => {
  // Don't hide if button is active or if clicking on our UI
  if (isButtonActive || 
      (refineButton && refineButton.contains(e.target)) ||
      (refineMenu && refineMenu.contains(e.target)) ||
      (overlay && overlay.contains(e.target))) {
    return;
  }
  
  // Only hide menu, not button
  if (refineMenu && !refineMenu.contains(e.target)) {
    hideRefineMenu();
  }
});

// Listen for messages from background script
if (checkExtensionContext()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Text Refiner: Content script received message:', request);
    if (request.action === "refineText") {
      handleTextRefinement(request.option, request.text)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open for async response
    }
  });
}

function handleTextSelection() {
  console.log('Text Refiner: Handling text selection...');
  
  // Skip if button is active to prevent interference
  if (isButtonActive) {
    console.log('Text Refiner: Button is active, skipping text selection handling');
    return;
  }
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  console.log('Text Refiner: Selected text length:', selectedText.length);
  console.log('Text Refiner: Selection range count:', selection.rangeCount);
  
  // Special handling for active element (input/textarea)
  const activeElement = document.activeElement;
  let inputSelectedText = '';
  let inputStart = null;
  let inputEnd = null;
  
  if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    if (start !== null && end !== null && start !== end) {
      inputSelectedText = activeElement.value.substring(start, end).trim();
      inputStart = start;
      inputEnd = end;
      console.log('Text Refiner: Input element selected text:', inputSelectedText, 'positions:', start, end);
    }
  }
  
  // Use either regular selection or input selection
  const finalSelectedText = selectedText || inputSelectedText;
  const targetElement = selectedText ? getElementFromSelection(selection) : activeElement;
  
  // If we already have UI visible and stored data with same text, don't hide it
  if ((refineButton || refineMenu) && storedTextData && storedTextData.text === finalSelectedText) {
    console.log('Text Refiner: UI active with same stored data, not processing new selection');
    return;
  }
  
  if (finalSelectedText.length > 0 && targetElement) {
    console.log('Text Refiner: Text found, showing refine button');
    console.log('Text Refiner: Target element:', targetElement.tagName, targetElement.type || 'N/A');
    
    // Store the text data with proper input positions
    storedTextData = {
      text: finalSelectedText,
      element: targetElement,
      selection: selection,
      range: selectedText && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null,
      inputStart: inputStart, // Use the correctly captured variable
      inputEnd: inputEnd,     // Use the correctly captured variable
      timestamp: Date.now()
    };
    
    currentSelection = selection;
    currentElement = targetElement;
    
    // For input elements, show button near the element
    if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
      showRefineButtonForInput(targetElement);
    } else {
      showRefineButton(selection);
    }
  } else {
    console.log('Text Refiner: No text selected or no target element');
    // Only hide if no text is selected at all
    if (!finalSelectedText) {
      hideRefineUI();
    }
  }
}

function getElementFromSelection(selection) {
  if (selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  let element = range.commonAncestorContainer;
  
  // If it's a text node, get its parent element
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }
  
  return element;
}

function showRefineButtonForInput(inputElement) {
  console.log('Text Refiner: Showing refine button for input element');
  hideRefineUI(); // Remove any existing UI
  
  try {
    const rect = inputElement.getBoundingClientRect();
    
    // Create refine button
    refineButton = document.createElement('button');
    refineButton.className = 'text-refiner-button input-positioned';
    refineButton.textContent = 'Refine';
    refineButton.type = 'button';
    
    // Position button much closer to the input element
    const left = rect.left + window.scrollX + rect.width - 75; // Position closer to the right edge
    const top = rect.top + window.scrollY - 30; // Position closer above the input
    
    // If there's not enough space above, position below
    const finalTop = top < 10 ? rect.bottom + window.scrollY + 3 : top;
    
    // Make sure button doesn't go off-screen to the right
    const finalLeft = Math.min(left, window.innerWidth + window.scrollX - 80);
    
    refineButton.style.left = `${finalLeft}px`;
    refineButton.style.top = `${finalTop}px`;
    
    console.log('Text Refiner: Button positioned for input at:', finalLeft, finalTop);
    
    refineButton.addEventListener('click', (e) => {
      console.log('Text Refiner: Refine button clicked for input!');
      e.preventDefault();
      e.stopPropagation();
      
      // Set button as active to prevent interference
      isButtonActive = true;
      
      showRefineMenu();
    }, true);
    
    // Prevent the button from interfering
    refineButton.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    
    refineButton.addEventListener('selectstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    
    // Store the selected text as backup
    if (storedTextData) {
      refineButton.dataset.selectedText = storedTextData.text;
    }
    
    document.body.appendChild(refineButton);
    console.log('Text Refiner: Refine button added to DOM for input');
    
  } catch (error) {
    console.error('Text Refiner: Error showing refine button for input:', error);
    showNotification('Error showing refine button', 'error');
  }
}

function showRefineButton(selection) {
  console.log('Text Refiner: Showing refine button...');
  hideRefineUI(); // Remove any existing UI
  
  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    console.log('Text Refiner: Selection rect:', rect);
    
    // Store the original selection range
    const originalRange = range.cloneRange();
    const originalSelectedText = selection.toString().trim();
    
    // Create refine button
    refineButton = document.createElement('button');
    refineButton.className = 'text-refiner-button';
    refineButton.textContent = 'Refine';
    refineButton.type = 'button';
    
    // Position button closer to the selected text
    const left = Math.max(10, rect.left + window.scrollX + (rect.width / 2) - 30); // Center button on selection
    const top = rect.top + window.scrollY - 35; // Position above the text
    
    // If there's not enough space above, position below
    const finalTop = top < 10 ? rect.bottom + window.scrollY + 5 : top;
    
    refineButton.style.left = `${left}px`;
    refineButton.style.top = `${finalTop}px`;
    
    console.log('Text Refiner: Button positioned at:', left, finalTop);
    
    refineButton.addEventListener('click', (e) => {
      console.log('Text Refiner: Refine button clicked!');
      e.preventDefault();
      e.stopPropagation();
      
      // Set button as active to prevent interference
      isButtonActive = true;
      
      showRefineMenu();
    }, true); // Use capture phase
    
    // Prevent the button from interfering with text selection
    refineButton.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    
    refineButton.addEventListener('selectstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    
    // Store the selected text as backup
    refineButton.dataset.selectedText = originalSelectedText;
    
    document.body.appendChild(refineButton);
    console.log('Text Refiner: Refine button added to DOM');
    
  } catch (error) {
    console.error('Text Refiner: Error showing refine button:', error);
    showNotification('Error showing refine button', 'error');
  }
}

function showRefineMenu() {
  console.log('Text Refiner: Showing refine menu...');
  
  if (refineMenu) {
    console.log('Text Refiner: Menu already showing');
    return; // Already showing
  }
  
  try {
    // Create overlay for click detection but don't remove button yet
    overlay = document.createElement('div');
    overlay.className = 'text-refiner-overlay';
    overlay.addEventListener('click', (e) => {
      e.stopPropagation();
      hideRefineMenu();
    });
    document.body.appendChild(overlay);
    
    // Create menu
    refineMenu = document.createElement('div');
    refineMenu.className = 'text-refiner-menu';
    
    // Prevent menu clicks from bubbling
    refineMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Add header
    const header = document.createElement('div');
    header.className = 'text-refiner-menu-header';
    header.textContent = 'Modify with AI';
    refineMenu.appendChild(header);
    
    // Get all options (default + custom)
    const allOptions = getAllRefineOptions();
    console.log('Text Refiner: All refine options:', allOptions);
    
    // Add default options
    defaultRefineOptions.forEach(option => {
      const item = createMenuItemElement(option);
      refineMenu.appendChild(item);
    });
    
    // Add separator if there are custom prompts
    if (customPrompts.length > 0) {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background: #e5e7eb; margin: 8px 0;';
      refineMenu.appendChild(separator);
      
      // Add custom prompts
      customPrompts.forEach(option => {
        const item = createMenuItemElement({
          id: option.id,
          icon: option.icon,
          text: option.name,
          prompt: option.prompt
        });
        refineMenu.appendChild(item);
      });
    }
    
    // Position menu near button
    if (refineButton) {
      const buttonRect = refineButton.getBoundingClientRect();
      const menuLeft = buttonRect.left + window.scrollX;
      const menuTop = buttonRect.bottom + window.scrollY + 5;
      
      refineMenu.style.left = `${menuLeft}px`;
      refineMenu.style.top = `${menuTop}px`;
    }
    
    document.body.appendChild(refineMenu);
    console.log('Text Refiner: Menu added to DOM');
    
  } catch (error) {
    console.error('Text Refiner: Error showing refine menu:', error);
    showNotification('Error showing menu', 'error');
  }
}

function createMenuItemElement(option) {
  const item = document.createElement('div');
  item.className = 'text-refiner-menu-item';
  item.dataset.optionId = option.id;
  
  const icon = document.createElement('span');
  icon.className = 'text-refiner-menu-item-icon';
  icon.textContent = option.icon;
  
  const text = document.createElement('span');
  text.className = 'text-refiner-menu-item-text';
  text.textContent = option.text;
  
  item.appendChild(icon);
  item.appendChild(text);
  
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Text Refiner: Menu item clicked:', option.id);
    handleRefineOptionClick(option.id);
  });
  
  return item;
}

function hideRefineMenu() {
  console.log('Text Refiner: Hiding refine menu...');
  
  if (refineMenu) {
    refineMenu.remove();
    refineMenu = null;
    console.log('Text Refiner: Menu removed');
  }
  if (overlay) {
    overlay.remove();
    overlay = null;
    console.log('Text Refiner: Overlay removed');
  }
  
  // Reset button active state when menu is hidden
  isButtonActive = false;
}

function hideRefineUI() {
  console.log('Text Refiner: Hiding refine UI...');
  
  // Reset active flag
  isButtonActive = false;
  
  // Clear stored data
  storedTextData = null;
  
  if (refineButton) {
    refineButton.remove();
    refineButton = null;
    console.log('Text Refiner: Button removed');
  }
  hideRefineMenu();
}

function handleRefineOptionClick(optionId) {
  console.log('Text Refiner: Option clicked:', optionId);
  
  // Check extension context before proceeding
  if (!checkExtensionContext()) {
    showNotification('Extension context lost. Please reload the page.', 'error');
    hideRefineUI();
    return;
  }
  
  // Use stored text data if available
  let selectedText = '';
  let element = null;
  
  if (storedTextData) {
    selectedText = storedTextData.text;
    element = storedTextData.element;
    currentElement = element;
    console.log('Text Refiner: Using stored text data:', selectedText);
  } else if (currentSelection && currentElement) {
    selectedText = currentSelection.toString().trim();
    element = currentElement;
  }
  
  // Fallback: try to get from button's stored data
  if (!selectedText && refineButton && refineButton.dataset.selectedText) {
    selectedText = refineButton.dataset.selectedText;
    element = currentElement;
    console.log('Text Refiner: Using button stored text:', selectedText);
  }
  
  // For input/textarea elements, get text from selection range
  if (!selectedText && element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (start !== end) {
      selectedText = element.value.substring(start, end);
      console.log('Text Refiner: Got selected text from input element:', selectedText);
    }
  }
  
  if (!selectedText) {
    console.error('Text Refiner: No selected text found');
    showNotification('Error: No text selected', 'error');
    isButtonActive = false; // Reset flag on error
    return;
  }
  
  // We now support any element, so no element validation needed
  console.log('Text Refiner: Processing text for universal replacement');
  
  const option = getAllRefineOptions().find(opt => opt.id === optionId);
  if (!option) {
    console.error('Text Refiner: Unknown option:', optionId);
    showNotification('Error: Unknown option', 'error');
    isButtonActive = false; // Reset flag on error
    return;
  }
  
  // Hide menu but keep button visible initially
  hideRefineMenu();
  
  // Change button text to show processing
  if (refineButton) {
    refineButton.textContent = 'Processing...';
    refineButton.disabled = true;
  }
  
  showLoadingNotification(`${option.text}ing text...`);
  
  // Send request to background script with better error handling
  try {
    chrome.runtime.sendMessage(
      { 
        action: "refineText", 
        text: selectedText,
        option: option
      },
      (response) => {
        // Check for Chrome runtime errors first
        if (chrome.runtime.lastError) {
          console.error('Text Refiner: Chrome runtime error:', chrome.runtime.lastError);
          hideNotification();
          
          // Check if it's an extension context invalidation error
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            showNotification('Extension was reloaded. Please refresh the page.', 'error');
          } else {
            showNotification(`Extension error: ${chrome.runtime.lastError.message}`, 'error');
          }
          
          // Reset button and flag
          if (refineButton) {
            refineButton.textContent = 'Refine';
            refineButton.disabled = false;
          }
          isButtonActive = false;
          return;
        }
        
        console.log('Text Refiner: Received response:', response);
        hideNotification();
        
        if (response && response.success) {
          replaceSelectedText(response.refinedText);
          showNotification(`Text ${option.text.toLowerCase()}d successfully!`, 'success');
          
          // Hide button after successful replacement
          setTimeout(() => {
            hideRefineUI();
          }, 1000);
        } else {
          const errorMsg = response?.error || 'Unknown error occurred';
          console.error('Text Refiner: Error:', errorMsg);
          showNotification(`Error: ${errorMsg}`, 'error');
          
          // Reset button and flag on error
          if (refineButton) {
            refineButton.textContent = 'Refine';
            refineButton.disabled = false;
          }
          isButtonActive = false;
        }
      }
    );
  } catch (error) {
    console.error('Text Refiner: Failed to send message:', error);
    hideNotification();
    
    // Provide more specific error messages
    if (error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh the page.', 'error');
    } else {
      showNotification('Failed to connect to extension background. Please reload the extension.', 'error');
    }
    
    // Reset button and flag on error
    if (refineButton) {
      refineButton.textContent = 'Refine';
      refineButton.disabled = false;
    }
    isButtonActive = false;
  }
}

function isEditableElement(element) {
  if (!element) return false;
  
  // Check for input elements
  if (element.tagName === 'INPUT') {
    const inputType = element.type.toLowerCase();
    const textInputTypes = ['text', 'email', 'password', 'search', 'tel', 'url', ''];
    return textInputTypes.includes(inputType);
  }
  
  // Check for textarea
  if (element.tagName === 'TEXTAREA') {
    return true;
  }
  
  // Check for contenteditable
  if (element.contentEditable === 'true' || element.isContentEditable) {
    return true;
  }
  
  // Check for elements with role="textbox"
  if (element.getAttribute('role') === 'textbox') {
    return true;
  }
  
  // Check for common rich text editor elements
  if (element.classList.contains('contenteditable') || 
      element.classList.contains('editor') ||
      element.classList.contains('rich-text')) {
    return true;
  }
  
  return false;
}

function getEditableElementFromSelection(selection) {
  console.log('Text Refiner: Finding editable element from selection');
  
  if (selection.rangeCount === 0) {
    console.log('Text Refiner: No selection range found');
    return null;
  }
  
  const range = selection.getRangeAt(0);
  let element = range.commonAncestorContainer;
  
  // If it's a text node, get its parent
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }
  
  console.log('Text Refiner: Starting element search from:', element?.tagName);
  
  // Check if element or its ancestors are editable
  let depth = 0;
  while (element && element !== document.body && element !== document.documentElement && depth < 10) {
    console.log(`Text Refiner: Checking element (depth ${depth}):`, element.tagName, {
      contentEditable: element.contentEditable,
      isContentEditable: element.isContentEditable,
      role: element.getAttribute('role'),
      type: element.type,
      classList: Array.from(element.classList || [])
    });
    
    if (isEditableElement(element)) {
      console.log('Text Refiner: Found editable element:', element);
      return element;
    }
    element = element.parentElement;
    depth++;
  }
  
  console.log('Text Refiner: No editable element found in hierarchy');
  return null;
}

function replaceSelectedText(newText) {
  console.log('Text Refiner: Replacing selected text with:', newText);
  
  let element = currentElement;
  
  // Use stored element if available and current element is not available
  if (!element && storedTextData) {
    element = storedTextData.element;
    currentElement = element;
    console.log('Text Refiner: Using stored element for replacement');
  }
  
  if (!element) {
    console.error('Text Refiner: Missing element for replacement');
    return;
  }
  
  try {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      // Handle input/textarea elements
      console.log('Text Refiner: Handling input/textarea element replacement');
      
      let start, end;
      const originalText = storedTextData ? storedTextData.text : '';
      
      // Use stored input positions if available
      if (storedTextData && storedTextData.inputStart !== null && storedTextData.inputEnd !== null) {
        start = storedTextData.inputStart;
        end = storedTextData.inputEnd;
        console.log('Text Refiner: Using stored input positions:', start, end);
      } else if (storedTextData && element === storedTextData.element && originalText) {
        // Try to find the text in the current value
        const currentValue = element.value;
        const textIndex = currentValue.indexOf(originalText);
        
        if (textIndex !== -1) {
          start = textIndex;
          end = textIndex + originalText.length;
          console.log('Text Refiner: Found text in input at positions:', start, end);
        } else {
          // Fallback to current selection
          start = element.selectionStart || 0;
          end = element.selectionEnd || start;
          console.log('Text Refiner: Using current selection positions:', start, end);
        }
      } else {
        // Use current selection
        start = element.selectionStart || 0;
        end = element.selectionEnd || start;
        console.log('Text Refiner: Using current selection positions (fallback):', start, end);
      }
      
      // Make sure start and end are valid
      if (start === undefined || end === undefined || start === end) {
        console.warn('Text Refiner: Invalid selection positions, trying to replace entire value');
        element.value = newText;
      } else {
        // Perform the replacement
        const value = element.value;
        const newValue = value.substring(0, start) + newText + value.substring(end);
        element.value = newValue;
        
        // Set cursor position after the new text
        const newCursorPosition = start + newText.length;
        element.selectionStart = newCursorPosition;
        element.selectionEnd = newCursorPosition;
      }
      
      // Focus the element
      element.focus();
      
      // Trigger input events for form validation and frameworks
      const inputEvent = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvent);
      
      const changeEvent = new Event('change', { bubbles: true });
      element.dispatchEvent(changeEvent);
      
      // Also trigger keyup for better compatibility
      const keyupEvent = new Event('keyup', { bubbles: true });
      element.dispatchEvent(keyupEvent);
      
      console.log('Text Refiner: Input element replacement successful');
      
    } else {
      // Handle ANY element (editable or non-editable)
      console.log('Text Refiner: Handling universal element replacement');
      
      let range;
      let textToReplace = '';
      let replacementSuccessful = false;
      
      if (storedTextData && storedTextData.range) {
        // Use stored range
        try {
          range = storedTextData.range.cloneRange();
          textToReplace = storedTextData.text;
          console.log('Text Refiner: Using stored range for replacement, text:', textToReplace);
        } catch (error) {
          console.warn('Text Refiner: Error cloning stored range:', error);
          range = null;
        }
      } else if (currentSelection && currentSelection.rangeCount > 0) {
        try {
          range = currentSelection.getRangeAt(0).cloneRange();
          textToReplace = range.toString();
          console.log('Text Refiner: Using current selection range, text:', textToReplace);
        } catch (error) {
          console.warn('Text Refiner: Error cloning current range:', error);
          range = null;
        }
      }
      
      // If no range available, use storedTextData text for fallback methods
      if (!range && storedTextData) {
        textToReplace = storedTextData.text;
        console.log('Text Refiner: No range available, using stored text for fallback methods');
      }
      
      if (!textToReplace) {
        console.error('Text Refiner: No text to replace');
        return;
      }
      
      // Method 1: Direct range replacement (works for any text, editable or not)
      if (range) {
        try {
          console.log('Text Refiner: Attempting direct range replacement');
          
          // Create a new selection to ensure range is still valid
          const selection = window.getSelection();
          selection.removeAllRanges();
          
          // Try to use the stored range
          try {
            selection.addRange(range);
            const rangeText = range.toString().trim();
            console.log('Text Refiner: Range text:', rangeText, 'Expected:', textToReplace);
            
            if (rangeText === textToReplace || rangeText.length > 0) {
              // Delete the selected content and insert new text
              range.deleteContents();
              
              // Create and insert the new text node
              const textNode = document.createTextNode(newText);
              range.insertNode(textNode);
              
              // Position cursor after the inserted text
              range.setStartAfter(textNode);
              range.collapse(true);
              selection.removeAllRanges();
              selection.addRange(range);
              
              replacementSuccessful = true;
              console.log('Text Refiner: Direct range replacement successful');
            }
          } catch (rangeError) {
            console.warn('Text Refiner: Range is no longer valid:', rangeError);
          }
        } catch (error) {
          console.warn('Text Refiner: Direct range replacement failed:', error);
        }
      }
      
      // Method 2: Text node traversal with exact text matching
      if (!replacementSuccessful && textToReplace) {
        try {
          console.log('Text Refiner: Attempting text node traversal replacement');
          
          // Find all text nodes containing our exact text
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: function(node) {
                return node.textContent.includes(textToReplace) ? 
                  NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
              }
            },
            false
          );
          
          const textNodes = [];
          while (walker.nextNode()) {
            textNodes.push(walker.currentNode);
          }
          
          // Replace in the first matching text node
          for (const node of textNodes) {
            const nodeText = node.textContent;
            const textIndex = nodeText.indexOf(textToReplace);
            
            if (textIndex !== -1) {
              console.log('Text Refiner: Found text in node, replacing...');
              
              // Split the text node and replace
              const beforeText = nodeText.substring(0, textIndex);
              const afterText = nodeText.substring(textIndex + textToReplace.length);
              
              // Create new nodes
              const parent = node.parentNode;
              const newTextNode = document.createTextNode(newText);
              
              if (beforeText) {
                const beforeNode = document.createTextNode(beforeText);
                parent.insertBefore(beforeNode, node);
              }
              
              parent.insertBefore(newTextNode, node);
              
              if (afterText) {
                const afterNode = document.createTextNode(afterText);
                parent.insertBefore(afterNode, node);
              }
              
              parent.removeChild(node);
              
              // Set selection after the new text
              try {
                const newRange = document.createRange();
                newRange.setStartAfter(newTextNode);
                newRange.collapse(true);
                
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(newRange);
              } catch (selectionError) {
                console.warn('Text Refiner: Could not set selection after replacement');
              }
              
              replacementSuccessful = true;
              console.log('Text Refiner: Text node traversal replacement successful');
              break;
            }
          }
        } catch (error) {
          console.warn('Text Refiner: Text node traversal replacement failed:', error);
        }
      }
      
      // Method 3: innerHTML replacement with precise text matching
      if (!replacementSuccessful && textToReplace) {
        try {
          console.log('Text Refiner: Attempting innerHTML replacement');
          
          const originalHTML = element.innerHTML;
          
          // Try to replace the exact text
          if (originalHTML.includes(textToReplace)) {
            const newHTML = originalHTML.replace(textToReplace, newText);
            
            if (newHTML !== originalHTML) {
              element.innerHTML = newHTML;
              replacementSuccessful = true;
              console.log('Text Refiner: innerHTML replacement successful');
            }
          } else {
            console.warn('Text Refiner: Text not found in innerHTML for replacement');
          }
        } catch (error) {
          console.warn('Text Refiner: innerHTML replacement failed:', error);
        }
      }
      
      // Method 4: Direct textContent replacement for simple cases
      if (!replacementSuccessful && textToReplace && element.textContent.includes(textToReplace)) {
        try {
          console.log('Text Refiner: Attempting textContent replacement');
          const newTextContent = element.textContent.replace(textToReplace, newText);
          element.textContent = newTextContent;
          replacementSuccessful = true;
          console.log('Text Refiner: textContent replacement successful');
        } catch (error) {
          console.warn('Text Refiner: textContent replacement failed:', error);
        }
      }
      
      // For editable elements, trigger events
      if (isEditableElement(element)) {
        element.focus();
        
        // Trigger various events that modern web apps might listen for
        const events = ['input', 'textInput', 'keyup', 'change'];
        events.forEach(eventType => {
          try {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            element.dispatchEvent(event);
          } catch (e) {
            // Ignore errors for unsupported events
          }
        });
        
        // Also trigger composition events for better compatibility
        try {
          element.dispatchEvent(new CompositionEvent('compositionend', { 
            bubbles: true, 
            data: newText 
          }));
        } catch (e) {
          // Ignore if CompositionEvent is not supported
        }
      }
      
      if (replacementSuccessful) {
        console.log('Text Refiner: Universal text replacement successful');
      } else {
        console.warn('Text Refiner: All replacement methods failed, showing warning');
        showNotification('Text replacement failed. Please try selecting the text again.', 'warning');
      }
    }
    
  } catch (error) {
    console.error('Text Refiner: Error replacing text:', error);
    showNotification('Error replacing text', 'error');
  }
}

function showNotification(message, type = 'info') {
  console.log('Text Refiner: Showing notification:', message, type);
  
  // Remove existing notification
  const existing = document.querySelector('.text-refiner-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `text-refiner-notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  if (type === 'success') {
    setTimeout(() => {
      notification.remove();
    }, 3000);
  } else if (type === 'error') {
    setTimeout(() => {
      notification.remove();
    }, 5000);
  } else if (type === 'warning') {
    setTimeout(() => {
      notification.remove();
    }, 4000);
  }
}

function showLoadingNotification(message) {
  console.log('Text Refiner: Showing loading notification:', message);
  
  // Remove existing notification
  const existing = document.querySelector('.text-refiner-notification');
  if (existing) {
    existing.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = 'text-refiner-notification loading';
  
  const spinner = document.createElement('div');
  spinner.className = 'text-refiner-spinner';
  
  const text = document.createElement('span');
  text.textContent = message;
  
  notification.appendChild(spinner);
  notification.appendChild(text);
  
  document.body.appendChild(notification);
}

function hideNotification() {
  const notification = document.querySelector('.text-refiner-notification');
  if (notification) {
    notification.remove();
  }
} 