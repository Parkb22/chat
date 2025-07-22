// SaaS Landing Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
  
  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });

  // Code tab switching
  const tabs = document.querySelectorAll('.tab');
  const codeBlocks = document.querySelectorAll('.code-block');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and code blocks
      tabs.forEach(t => t.classList.remove('active'));
      codeBlocks.forEach(cb => cb.classList.remove('active'));
      
      // Add active class to clicked tab
      tab.classList.add('active');
      
      // Show corresponding code block
      const targetCode = document.getElementById(tab.dataset.tab + '-code');
      if (targetCode) {
        targetCode.classList.add('active');
      }
    });
  });

  // Pricing toggle (Monthly/Annual)
  const annualToggle = document.getElementById('annual-toggle');
  const priceAmounts = document.querySelectorAll('.amount');
  
  if (annualToggle) {
    annualToggle.addEventListener('change', function() {
      const isAnnual = this.checked;
      
      priceAmounts.forEach(amount => {
        const monthly = amount.dataset.monthly;
        const annual = amount.dataset.annual;
        
        if (isAnnual) {
          amount.textContent = annual;
        } else {
          amount.textContent = monthly;
        }
      });
    });
  }

  // Mobile menu toggle
  const mobileMenu = document.querySelector('.mobile-menu');
  const navLinks = document.querySelector('.nav-links');
  
  if (mobileMenu) {
    mobileMenu.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-active');
      mobileMenu.classList.toggle('active');
    });
  }

  // Navbar scroll effect
  const navbar = document.querySelector('.navbar');
  let lastScrollTop = 0;
  
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > 100) {
      navbar.style.background = 'rgba(15, 23, 42, 0.98)';
      navbar.style.backdropFilter = 'blur(20px)';
    } else {
      navbar.style.background = 'rgba(15, 23, 42, 0.95)';
      navbar.style.backdropFilter = 'blur(10px)';
    }
    
    lastScrollTop = scrollTop;
  });

  // Intersection Observer for animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe elements for animation
  document.querySelectorAll('.feature-card, .pricing-card, .integration-features .feature-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'all 0.6s ease';
    observer.observe(el);
  });

  // Email signup form
  const signupForm = document.querySelector('.signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = this.querySelector('.email-input').value;
      
      if (email) {
        // Simulate signup process
        const btn = this.querySelector('.btn-signup');
        const originalText = btn.textContent;
        
        btn.textContent = 'Signing up...';
        btn.disabled = true;
        
        setTimeout(() => {
          btn.textContent = 'Check your email!';
          btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          
          setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            this.querySelector('.email-input').value = '';
          }, 3000);
        }, 2000);
      }
    });
  }

  // Demo notification
  setTimeout(() => {
    showDemoNotification();
  }, 5000);

  function showDemoNotification() {
    const badge = document.querySelector('.notification-badge');
    if (badge) {
      badge.classList.remove('hidden');
      
      // Hide after 10 seconds
      setTimeout(() => {
        badge.classList.add('hidden');
      }, 10000);
    }
  }
});

// Copy code functionality
function copyCode() {
  const activeCode = document.querySelector('.code-block.active code');
  if (activeCode) {
    const textArea = document.createElement('textarea');
    textArea.value = activeCode.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    const copyBtn = document.querySelector('.copy-btn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = '✅ Copied!';
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  }
}

// Demo chat widget functionality
let chatVisible = false;

function toggleChat() {
  const chatWidget = document.getElementById('chat-widget');
  const chatButton = document.getElementById('chat-widget-button');
  const badge = document.querySelector('.notification-badge');
  
  chatVisible = !chatVisible;
  
  if (chatVisible) {
    chatWidget.classList.remove('hidden');
    // Remove annoying icon rotation - chatButton.style.transform = 'rotate(180deg)';
    badge.classList.add('hidden');
  } else {
    chatWidget.classList.add('hidden');
    // Remove annoying icon rotation - chatButton.style.transform = 'rotate(0deg)';
  }
}

// Close chat when clicking outside
document.addEventListener('click', function(e) {
  const chatWidget = document.getElementById('chat-widget');
  const chatButton = document.getElementById('chat-widget-button');
  
  if (chatVisible && 
      !chatWidget.contains(e.target) && 
      !chatButton.contains(e.target)) {
    toggleChat();
  }
});

// Analytics tracking (placeholder)
function trackEvent(event, properties = {}) {
  console.log('Analytics Event:', event, properties);
  // In production, send to your analytics service
}

// Track button clicks
document.addEventListener('click', function(e) {
  const target = e.target;
  
  if (target.classList.contains('btn-primary-large')) {
    trackEvent('cta_clicked', { location: 'hero', type: 'primary' });
  } else if (target.classList.contains('btn-secondary-large')) {
    trackEvent('demo_clicked', { location: 'hero' });
  } else if (target.classList.contains('btn-plan')) {
    const plan = target.closest('.pricing-card').querySelector('h3').textContent;
    trackEvent('pricing_clicked', { plan: plan });
  } else if (target.classList.contains('copy-btn')) {
    trackEvent('code_copied');
  }
}); 

// Handle widget expansion messages from iframe
window.addEventListener('message', function(event) {
  if (event.data.type === 'widget_expanded') {
    const chatWidget = document.getElementById('chat-widget');
    const chatButton = document.getElementById('chat-widget-button');
    const iframe = chatWidget.querySelector('iframe');
    
    console.log('Widget expansion message received:', event.data.expanded);
    
    if (event.data.expanded) {
      // Expand the widget - make it stick to the right side of the screen
      chatWidget.style.position = 'fixed';
      chatWidget.style.top = '0';
      chatWidget.style.right = '0';
      chatWidget.style.width = '400px';
      chatWidget.style.height = '100vh';
      chatWidget.style.zIndex = '9999';
      chatWidget.style.borderRadius = '0';
      chatWidget.style.border = 'none';
      chatWidget.style.boxShadow = '-5px 0 20px rgba(0,0,0,0.3)';
      
      // Hide the chat button when expanded
      if (chatButton) {
        chatButton.style.display = 'none';
      }
    } else {
      // Return to normal chat widget size
      chatWidget.style.position = '';
      chatWidget.style.top = '';
      chatWidget.style.right = '';
      chatWidget.style.width = '';
      chatWidget.style.height = '';
      chatWidget.style.zIndex = '';
      chatWidget.style.borderRadius = '';
      chatWidget.style.border = '';
      chatWidget.style.boxShadow = '';
      
      // Show the chat button again
      if (chatButton) {
        chatButton.style.display = '';
        console.log('Chat button restored');
      }
    }
  }
});

// Backup: Ensure chat button is always accessible
// Check every 5 seconds if widget is not expanded but button is hidden
setInterval(() => {
  const chatWidget = document.getElementById('chat-widget');
  const chatButton = document.getElementById('chat-widget-button');
  
  if (chatWidget && chatButton) {
    const isWidgetExpanded = chatWidget.style.position === 'fixed' && 
                            chatWidget.style.height === '100vh';
    const isButtonHidden = chatButton.style.display === 'none';
    
    // If widget is not expanded but button is hidden, show the button
    if (!isWidgetExpanded && isButtonHidden) {
      console.log('Backup: Restoring hidden chat button');
      chatButton.style.display = '';
    }
  }
}, 5000);

// Additional safeguard: Restore button on page focus
window.addEventListener('focus', () => {
  const chatWidget = document.getElementById('chat-widget');
  const chatButton = document.getElementById('chat-widget-button');
  
  if (chatWidget && chatButton) {
    const isWidgetExpanded = chatWidget.style.position === 'fixed' && 
                            chatWidget.style.height === '100vh';
    
    if (!isWidgetExpanded && chatButton.style.display === 'none') {
      console.log('Page focus: Restoring chat button');
      chatButton.style.display = '';
    }
  }
});