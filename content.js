// Text Refiner Content Script
console.log('🚀 Text Refiner: Content script starting...');

// Simplified storage - single source of truth
let storedTextData = null;
let refineButton = null;
let refineMenu = null;
let overlay = null;
let customPrompts = [];
let isButtonActive = false;
let extensionContextValid = true;
let extensionInitialized = false;

// Initialize extension
function initializeExtension() {
  if (extensionInitialized) {
    console.log('✅ Extension already initialized');
    return;
  }
  
  try {
    console.log('🔧 Initializing Text Refiner extension...');
    
    // Test basic functionality
    if (typeof chrome === 'undefined') {
      console.error('❌ Chrome API not available');
      return;
    }
    
    if (!chrome.runtime || !chrome.runtime.id) {
      console.error('❌ Chrome runtime not available');
      return;
    }
    
    extensionInitialized = true;
    console.log('✅ Text Refiner: Content script loaded and initialized');
    
    // Load custom prompts after initialization
    loadCustomPrompts();
    
  } catch (error) {
    console.error('❌ Failed to initialize extension:', error);
  }
}

// Call initialization
initializeExtension();

// Retry initialization after page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  // Document already loaded
  setTimeout(initializeExtension, 100);
}

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
    if (chrome && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.getManifest();
      extensionContextValid = true;
      return true;
    }
  } catch (error) {
    extensionContextValid = false;
    console.warn('Text Refiner: Extension context is invalid:', error.message);
    
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

// Listen for storage changes to update custom prompts
if (checkExtensionContext()) {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.customPrompts) {
      customPrompts = changes.customPrompts.newValue || [];
      console.log('Text Refiner: Custom prompts updated:', customPrompts);
    }
  });
}

// Unified event listeners for text selection
document.addEventListener('mouseup', (e) => {
  if (shouldIgnoreEvent(e)) return;
  setTimeout(handleTextSelection, 100);
});

document.addEventListener('keyup', (e) => {
  if (!isButtonActive) {
    setTimeout(handleTextSelection, 100);
  }
});

document.addEventListener('selectionchange', () => {
  if (!isButtonActive) {
    setTimeout(handleTextSelection, 150);
  }
});

// Listen for clicks to hide menu
document.addEventListener('click', (e) => {
  if (shouldIgnoreEvent(e)) return;
  
  if (refineMenu && !refineMenu.contains(e.target)) {
    hideRefineMenu();
  }
});

// Helper function to determine if we should ignore an event
function shouldIgnoreEvent(e) {
  return isButtonActive || 
         (refineButton && refineButton.contains(e.target)) ||
         (refineMenu && refineMenu.contains(e.target)) ||
         (overlay && overlay.contains(e.target));
}

// Listen for messages from background script
if (checkExtensionContext()) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Text Refiner: Content script received message:', request);
    if (request.action === "refineText") {
      handleTextRefinement(request.option, request.text)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });
}

/**
 * Main text selection handler - works for both input and non-input elements
 * Detects text selection, stores data, and shows the refine button
 */
function handleTextSelection() {
  console.log('👀 Text Refiner: Handling text selection...');
  
  if (isButtonActive) {
    console.log('⏸️ Button is active, skipping text selection handling');
    return;
  }
  
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  console.log('📊 Selection stats:');
  console.log('  - Selected text length:', selectedText.length);
  console.log('  - Selection range count:', selection.rangeCount);
  console.log('  - Selected text preview:', selectedText.substring(0, 50) + (selectedText.length > 50 ? '...' : ''));
  
  // Check for input/textarea selection (prioritized)
  const activeElement = document.activeElement;
  let inputSelectedText = '';
  let inputStart = null;
  let inputEnd = null;
  let hasInputSelection = false;
  
  console.log('🎯 Active element:', activeElement?.tagName, activeElement?.type);
  
  // Check if we have an input/textarea with actual text selection
  if (activeElement && isInputElement(activeElement)) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    console.log('📍 Input selection positions:', start, '->', end);
    
    if (start !== null && end !== null && start !== end && start < end) {
      inputSelectedText = activeElement.value.substring(start, end).trim();
      if (inputSelectedText.length > 0) {
        inputStart = start;
        inputEnd = end;
        hasInputSelection = true;
        console.log('✅ Input element selected text:', inputSelectedText);
      }
    }
  }
  
  // Determine final selection
  const finalSelectedText = hasInputSelection ? inputSelectedText : selectedText;
  const targetElement = hasInputSelection ? activeElement : getElementFromSelection(selection);
  
  console.log('🎯 Final selected text:', finalSelectedText);
  console.log('🎯 Target element:', targetElement?.tagName, targetElement?.type || 'N/A');
  
  // Skip if same text already stored and UI is visible
  if ((refineButton || refineMenu) && storedTextData && storedTextData.text === finalSelectedText) {
    console.log('✅ UI active with same stored data, skipping');
    return;
  }
  
  if (finalSelectedText.length > 0 && targetElement) {
    console.log('🚀 Text found, storing and showing refine button');

    // Remove previous UI before storing new selection
    hideRefineUI();

    // Store text data - single source of truth
    storedTextData = {
      text: finalSelectedText,
      element: targetElement,
      selection: hasInputSelection ? null : selection,
      range: !hasInputSelection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null,
      inputStart: inputStart,
      inputEnd: inputEnd,
      isInputElement: hasInputSelection,
      timestamp: Date.now()
    };
    
    console.log('💾 Stored data:', storedTextData);

    // Show unified button
    showRefineButton(targetElement, hasInputSelection);
  } else {
    console.log('❌ No text selected');
    hideRefineUI();
  }
}

/**
 * Helper function to check if element is an input element
 */
function isInputElement(element) {
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';
}

/**
 * Get element from selection for non-input elements
 */
function getElementFromSelection(selection) {
  if (selection.rangeCount === 0) return null;
  
  const range = selection.getRangeAt(0);
  let element = range.commonAncestorContainer;
  
  if (element.nodeType === Node.TEXT_NODE) {
    element = element.parentElement;
  }
  
  return element;
}

/**
 * Unified button display function - works for both input and non-input elements
 * @param {Element} targetElement - The element containing the selected text
 * @param {boolean} isInput - Whether the target is an input element
 */
function showRefineButton(targetElement, isInput = false) {
  console.log('🔧 Text Refiner: Showing refine button');
  console.log('🎯 Target element:', targetElement.tagName, targetElement.type || 'N/A');
  console.log('📝 Is input element:', isInput);

  // Remove any existing button without clearing stored data
  if (refineButton) {
    refineButton.remove();
    refineButton = null;
  }
  
  try {
    // Create refine button
    refineButton = document.createElement('button');
    refineButton.className = 'text-refiner-button';
    refineButton.textContent = 'Refine';
    refineButton.type = 'button';
    
    let buttonPosition;
    
    if (isInput) {
      // Position for input elements - beside the input
      buttonPosition = calculateInputButtonPosition(targetElement);
    } else {
      // Position for regular text selection - near the selection
      buttonPosition = calculateSelectionButtonPosition();
    }
    
    // Apply position
    refineButton.style.position = 'absolute';
    refineButton.style.left = `${buttonPosition.left}px`;
    refineButton.style.top = `${buttonPosition.top}px`;
    refineButton.style.zIndex = '2147483647';
    
    console.log('🎯 Button positioned at:', buttonPosition);
    
    // Add event listeners
    refineButton.addEventListener('click', handleButtonClick, true);
    refineButton.addEventListener('mousedown', preventEvent, true);
    refineButton.addEventListener('selectstart', preventEvent, true);
    
    // Store selected text as backup
    if (storedTextData) {
      refineButton.dataset.selectedText = storedTextData.text;
    }
    
    document.body.appendChild(refineButton);
    console.log('✅ Refine button added to DOM');
    
  } catch (error) {
    console.error('❌ Error showing refine button:', error);
    showNotification('Error showing refine button', 'error');
  }
}

/**
 * Calculate button position for input elements
 */
function calculateInputButtonPosition(inputElement) {
  const rect = inputElement.getBoundingClientRect();
  const gap = 8;
  const buttonWidth = 60;
  const buttonHeight = 28;
  
  let left = rect.right + window.scrollX + gap;
  let top = rect.top + window.scrollY + (rect.height - buttonHeight) / 2;
  
  // Check if button would go off-screen to the right
  const maxLeft = window.innerWidth + window.scrollX - buttonWidth - 10;
  if (left > maxLeft) {
    left = rect.left + window.scrollX - buttonWidth - gap;
  }
  
  // Ensure button doesn't go off-screen vertically
  const maxTop = window.innerHeight + window.scrollY - buttonHeight - 10;
  const minTop = window.scrollY + 10;
  top = Math.max(minTop, Math.min(top, maxTop));
  
  return { left, top };
}

/**
 * Calculate button position for text selections
 */
function calculateSelectionButtonPosition() {
  const selection = window.getSelection();
  if (selection.rangeCount === 0) {
    return { left: 100, top: 100 }; // Fallback position
  }
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  // Position button near the selected text
  const left = Math.max(10, rect.left + window.scrollX + (rect.width / 2) - 30);
  let top = rect.top + window.scrollY - 35;
  
  // If not enough space above, position below
  if (top < 10) {
    top = rect.bottom + window.scrollY + 5;
  }
  
  return { left, top };
}

/**
 * Handle button click events
 */
function handleButtonClick(e) {
  console.log('Text Refiner: Refine button clicked!');
  e.preventDefault();
  e.stopPropagation();
  
  isButtonActive = true;
  showRefineMenu();
}

/**
 * Prevent event propagation for button events
 */
function preventEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Show the refine menu with all available options
 */
function showRefineMenu() {
  console.log('Text Refiner: Showing refine menu...');
  
  if (refineMenu) {
    console.log('Text Refiner: Menu already showing');
    return;
  }
  
  try {
    // Create overlay for click detection
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
    
    refineMenu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Add header
    const header = document.createElement('div');
    header.className = 'text-refiner-menu-header';
    header.textContent = 'Modify with AI';
    refineMenu.appendChild(header);
    
    // Add default options
    defaultRefineOptions.forEach(option => {
      const item = createMenuItemElement(option);
      refineMenu.appendChild(item);
    });
    
    // Add custom prompts if available
    if (customPrompts.length > 0) {
      const separator = document.createElement('div');
      separator.style.cssText = 'height: 1px; background: #e5e7eb; margin: 8px 0;';
      refineMenu.appendChild(separator);
      
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

/**
 * Create a menu item element
 */
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

/**
 * Hide the refine menu
 */
function hideRefineMenu() {
  console.log('Text Refiner: Hiding refine menu...');
  
  if (refineMenu) {
    refineMenu.remove();
    refineMenu = null;
  }
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
  
  isButtonActive = false;
}

/**
 * Hide all refine UI elements and clear stored data
 */
function hideRefineUI() {
  console.log('Text Refiner: Hiding refine UI...');
  
  isButtonActive = false;
  storedTextData = null;
  
  if (refineButton) {
    refineButton.remove();
    refineButton = null;
  }
  hideRefineMenu();
}

/**
 * Handle refine option selection and send to background script
 */
function handleRefineOptionClick(optionId) {
  console.log('Text Refiner: Option clicked:', optionId);
  
  if (!checkExtensionContext()) {
    showNotification('Extension context lost. Please reload the page.', 'error');
    hideRefineUI();
    return;
  }
  
  if (!storedTextData || !storedTextData.text || !storedTextData.element) {
    console.error('❌ No stored text data found');
    showNotification('Error: No text selected. Please select some text first.', 'error');
    isButtonActive = false;
    return;
  }
  
  const selectedText = storedTextData.text;
  const element = storedTextData.element;
  
  console.log('🎯 Using stored data for refinement:');
  console.log('  - Text:', selectedText);
  console.log('  - Element:', element.tagName, element.type || 'N/A');
  console.log('  - Is input:', storedTextData.isInputElement);
  console.log('  - Input positions:', storedTextData.inputStart, '->', storedTextData.inputEnd);
  
  const option = getAllRefineOptions().find(opt => opt.id === optionId);
  if (!option) {
    console.error('Text Refiner: Unknown option:', optionId);
    showNotification('Error: Unknown option', 'error');
    isButtonActive = false;
    return;
  }
  
  hideRefineMenu();
  
  // Update button to show processing state
  if (refineButton) {
    refineButton.textContent = 'Processing...';
    refineButton.disabled = true;
  }
  
  showLoadingNotification(`${option.text}ing text...`);
  
  // Send request to background script
  try {
    chrome.runtime.sendMessage(
      { 
        action: "refineText", 
        text: selectedText,
        option: option
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Text Refiner: Chrome runtime error:', chrome.runtime.lastError);
          hideNotification();
          
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            showNotification('Extension was reloaded. Please refresh the page.', 'error');
          } else {
            showNotification(`Extension error: ${chrome.runtime.lastError.message}`, 'error');
          }
          
          resetButton();
          return;
        }
        
        console.log('Text Refiner: Received response:', response);
        hideNotification();
        
        if (response && response.success) {
          replaceSelectedText(response.refinedText);
          showNotification(`Text ${option.text.toLowerCase()}d successfully!`, 'success');
          
          setTimeout(() => {
            hideRefineUI();
          }, 1000);
        } else {
          const errorMsg = response?.error || 'Unknown error occurred';
          console.error('Text Refiner: Error:', errorMsg);
          showNotification(`Error: ${errorMsg}`, 'error');
          resetButton();
        }
      }
    );
  } catch (error) {
    console.error('Text Refiner: Failed to send message:', error);
    hideNotification();
    
    if (error.message.includes('Extension context invalidated')) {
      showNotification('Extension was reloaded. Please refresh the page.', 'error');
    } else {
      showNotification('Failed to connect to extension background. Please reload the extension.', 'error');
    }
    
    resetButton();
  }
}

/**
 * Reset button to normal state
 */
function resetButton() {
  if (refineButton) {
    refineButton.textContent = 'Refine';
    refineButton.disabled = false;
  }
  isButtonActive = false;
}

/**
 * Check if element is editable
 */
function isEditableElement(element) {
  if (!element) return false;
  
  if (element.tagName === 'INPUT') {
    const inputType = element.type.toLowerCase();
    const textInputTypes = ['text', 'email', 'password', 'search', 'tel', 'url', ''];
    return textInputTypes.includes(inputType);
  }
  
  if (element.tagName === 'TEXTAREA') {
    return true;
  }
  
  if (element.contentEditable === 'true' || element.isContentEditable) {
    return true;
  }
  
  if (element.getAttribute('role') === 'textbox') {
    return true;
  }
  
  if (element.classList.contains('contenteditable') || 
      element.classList.contains('editor') ||
      element.classList.contains('rich-text')) {
    return true;
  }
  
  return false;
}

/**
 * Replace selected text with refined version
 * Handles both input elements and regular text elements
 */
function replaceSelectedText(newText) {
  console.log('🔄 Text Refiner: Starting text replacement with:', newText);
  
  if (!storedTextData || !storedTextData.element || !storedTextData.text) {
    console.error('❌ Text Refiner: Missing stored data for replacement');
    showNotification('Error: No stored text data for replacement', 'error');
    return;
  }
  
  const element = storedTextData.element;
  const originalText = storedTextData.text;
  
  console.log('📍 Element:', element.tagName, element.type);
  console.log('💾 Using stored data:', storedTextData);
  
  try {
    if (isInputElement(element)) {
      replaceTextInInputElement(element, originalText, newText);
    } else {
      replaceTextInRegularElement(element, originalText, newText);
    }
  } catch (error) {
    console.error('❌ Critical error in text replacement:', error);
    showNotification('Critical error: ' + error.message, 'error');
  }
}

/**
 * Replace text in input/textarea elements
 */
function replaceTextInInputElement(element, originalText, newText) {
  console.log('📝 Handling INPUT/TEXTAREA replacement');
  
  let start = 0;
  let end = element.value.length;
  
  // Use stored positions if available
  if (storedTextData.isInputElement && 
      storedTextData.inputStart !== null && 
      storedTextData.inputEnd !== null) {
    start = storedTextData.inputStart;
    end = storedTextData.inputEnd;
    console.log('✅ Using stored positions:', start, '->', end);
  } else {
    // Fallback: find the text in the current value
    const textIndex = element.value.indexOf(originalText);
    if (textIndex !== -1) {
      start = textIndex;
      end = textIndex + originalText.length;
      console.log('✅ Found text at positions:', start, '->', end);
    } else {
      console.log('⚠️ Text not found, using current selection');
      start = element.selectionStart || 0;
      end = element.selectionEnd || element.value.length;
    }
  }
  
  // Validate positions
  if (start < 0 || end > element.value.length || start >= end) {
    console.log('❌ Invalid positions, using full value replacement');
    start = 0;
    end = element.value.length;
  }
  
  // Perform the replacement
  const originalValue = element.value;
  const beforeText = originalValue.substring(0, start);
  const afterText = originalValue.substring(end);
  const newValue = beforeText + newText + afterText;
  
  console.log('🔄 Replacement details:');
  console.log('  - Original:', originalValue.substring(start, end));
  console.log('  - New:', newText);
  
  // Set the new value
  element.value = newValue;
  
  // Set cursor position after the new text
  const newCursorPosition = start + newText.length;
  element.selectionStart = newCursorPosition;
  element.selectionEnd = newCursorPosition;
  
  // Focus and trigger events
  element.focus();
  
  // Trigger necessary events
  ['input', 'change', 'keyup'].forEach(eventType => {
    const event = new Event(eventType, { bubbles: true });
    element.dispatchEvent(event);
  });
  
  console.log('✅ INPUT/TEXTAREA replacement successful');
  showNotification('Text replaced successfully!', 'success');
}

/**
 * Replace text in regular elements (contenteditable, etc.)
 */
function replaceTextInRegularElement(element, originalText, newText) {
  console.log('📄 Handling general element replacement');
  
  let replacementSuccessful = false;
  
  // Method 1: Try range replacement if we have a stored range
  if (storedTextData.range) {
    try {
      console.log('🎯 Attempting range replacement...');
      
      const range = storedTextData.range.cloneRange();
      const rangeText = range.toString();
      
      if (rangeText === originalText || rangeText.includes(originalText)) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        
        range.deleteContents();
        const textNode = document.createTextNode(newText);
        range.insertNode(textNode);
        
        // Position cursor after new text
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        
        replacementSuccessful = true;
        console.log('✅ Range replacement successful');
      }
    } catch (error) {
      console.warn('⚠️ Range replacement failed:', error.message);
    }
  }
  
  // Method 2: Direct text replacement in element
  if (!replacementSuccessful) {
    try {
      console.log('🔍 Attempting direct text replacement...');
      
      // Try innerHTML replacement first
      if (element.innerHTML && element.innerHTML.includes(originalText)) {
        element.innerHTML = element.innerHTML.replace(originalText, newText);
        replacementSuccessful = true;
        console.log('✅ innerHTML replacement successful');
      }
      // Try textContent replacement
      else if (element.textContent && element.textContent.includes(originalText)) {
        element.textContent = element.textContent.replace(originalText, newText);
        replacementSuccessful = true;
        console.log('✅ textContent replacement successful');
      }
    } catch (error) {
      console.warn('⚠️ Direct replacement failed:', error.message);
    }
  }
  
  // Method 3: Find and replace in text nodes
  if (!replacementSuccessful) {
    try {
      console.log('🔍 Attempting text node replacement...');
      
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(originalText)) {
          node.textContent = node.textContent.replace(originalText, newText);
          replacementSuccessful = true;
          console.log('✅ Text node replacement successful');
          break;
        }
      }
    } catch (error) {
      console.warn('⚠️ Text node replacement failed:', error.message);
    }
  }
  
  if (replacementSuccessful) {
    console.log('✅ General element replacement successful');
    showNotification('Text replaced successfully!', 'success');
    
    // Trigger events for editable elements
    if (isEditableElement(element)) {
      element.focus();
      ['input', 'change'].forEach(eventType => {
        const event = new Event(eventType, { bubbles: true });
        element.dispatchEvent(event);
      });
    }
  } else {
    console.error('❌ All replacement methods failed');
    showNotification('Failed to replace text. Please try selecting again.', 'error');
  }
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  // Notifications were used in the original version to display status messages
  // on the page. To simplify the extension, these now only log to the console.
  console.log(`Text Refiner [${type}]:`, message);
}

/**
 * Show loading notification with spinner
 */
function showLoadingNotification(message) {
  // Loading notifications are reduced to console logs for simplicity.
  console.log('Text Refiner [loading]:', message);
}

/**
 * Hide notification
 */
function hideNotification() {
  // In the simplified build notifications are not rendered, so this is a no-op.
}

// Debug utilities for testing
window.textRefinerDebug = {
  test: () => {
    console.log('🧪 Text Refiner Debug Test');
    console.log('Extension initialized:', extensionInitialized);
    console.log('Stored data:', storedTextData);
    console.log('Button active:', isButtonActive);
  },
  
  forceSelection: (text = 'test') => {
    storedTextData = {
      text: text,
      element: document.body,
      selection: window.getSelection(),
      range: null,
      inputStart: null,
      inputEnd: null,
      isInputElement: false,
      timestamp: Date.now()
    };
    showRefineButton(document.body, false);
  },
  
  testInput: () => {
    const input = document.querySelector('input, textarea');
    if (!input) {
      console.log('No input found');
      return;
    }
    input.value = 'Test text for refinement';
    input.focus();
    input.setSelectionRange(5, 9); // Select "text"
    setTimeout(handleTextSelection, 100);
  }
};

console.log('🛠️ Debug functions: window.textRefinerDebug.test(), .forceSelection(), .testInput()'); 