// Unified Modal System for Moon Lamp PWA
// Replaces native alert() and confirm() with styled modals

class Modal {
    static instance = null;
    
    constructor() {
        if (Modal.instance) return Modal.instance;
        Modal.instance = this;
        this.createModalElement();
    }
    
    createModalElement() {
        // Create modal container
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-icon"></div>
                <div class="modal-title"></div>
                <div class="modal-message"></div>
                <div class="modal-buttons"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        this.overlay = overlay;
        this.container = overlay.querySelector('.modal-container');
        this.iconEl = overlay.querySelector('.modal-icon');
        this.titleEl = overlay.querySelector('.modal-title');
        this.messageEl = overlay.querySelector('.modal-message');
        this.buttonsEl = overlay.querySelector('.modal-buttons');
        
        // Close on overlay click (for alerts only)
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && this.currentType === 'alert') {
                this.close();
            }
        });
    }
    
    show(options) {
        const {
            type = 'info',      // info, success, warning, error, confirm
            title = '',
            message = '',
            confirmText = 'OK',
            cancelText = 'Cancel',
            onConfirm = null,
            onCancel = null
        } = options;
        
        this.currentType = type === 'confirm' ? 'confirm' : 'alert';
        
        // Set icon based on type
        const icons = {
            info: 'ℹ',
            success: '✓',
            warning: '⚠',
            error: '✕',
            confirm: '?'
        };
        
        this.iconEl.textContent = icons[type] || icons.info;
        this.iconEl.className = `modal-icon modal-icon-${type}`;
        
        // Set title (use type as default if no title)
        const defaultTitles = {
            info: 'Info',
            success: 'Success',
            warning: 'Warning',
            error: 'Error',
            confirm: 'Confirm'
        };
        this.titleEl.textContent = title || defaultTitles[type] || '';
        
        // Set message
        this.messageEl.textContent = message;
        
        // Create buttons
        this.buttonsEl.innerHTML = '';
        
        if (type === 'confirm') {
            // Cancel button
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'modal-btn modal-btn-cancel';
            cancelBtn.textContent = cancelText;
            cancelBtn.addEventListener('click', () => {
                this.close();
                if (onCancel) onCancel();
            });
            this.buttonsEl.appendChild(cancelBtn);
            
            // Confirm button
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'modal-btn modal-btn-confirm';
            confirmBtn.textContent = confirmText;
            confirmBtn.addEventListener('click', () => {
                this.close();
                if (onConfirm) onConfirm();
            });
            this.buttonsEl.appendChild(confirmBtn);
        } else {
            // Single OK button for alerts
            const okBtn = document.createElement('button');
            okBtn.className = `modal-btn modal-btn-${type}`;
            okBtn.textContent = confirmText;
            okBtn.addEventListener('click', () => {
                this.close();
                if (onConfirm) onConfirm();
            });
            this.buttonsEl.appendChild(okBtn);
        }
        
        // Show modal
        this.overlay.classList.add('active');
        this.container.classList.add('active');
        
        // Focus first button
        const firstBtn = this.buttonsEl.querySelector('button');
        if (firstBtn) firstBtn.focus();
    }
    
    close() {
        this.overlay.classList.remove('active');
        this.container.classList.remove('active');
    }
    
    // Static convenience methods
    static alert(message, type = 'info', title = '') {
        return new Promise((resolve) => {
            const modal = new Modal();
            modal.show({
                type,
                title,
                message,
                onConfirm: resolve
            });
        });
    }
    
    static success(message, title = '') {
        return Modal.alert(message, 'success', title);
    }
    
    static warning(message, title = '') {
        return Modal.alert(message, 'warning', title);
    }
    
    static error(message, title = '') {
        return Modal.alert(message, 'error', title);
    }
    
    static confirm(message, title = '') {
        return new Promise((resolve) => {
            const modal = new Modal();
            modal.show({
                type: 'confirm',
                title,
                message,
                onConfirm: () => resolve(true),
                onCancel: () => resolve(false)
            });
        });
    }
}

// Initialize modal on DOM ready
document.addEventListener('DOMContentLoaded', () => new Modal());

export { Modal };
