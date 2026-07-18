(function() {
    // 1. Immediate Session Guard Check (Prevents FOUC)
    const path = window.location.pathname;
    const isAuthPage = path.endsWith('login.html') || path.endsWith('register.html');
    const isPublicPage = path.endsWith('about_us.html') || isAuthPage;
    const userStr = localStorage.getItem('user');
    let user = null;

    try {
        user = userStr ? JSON.parse(userStr) : null;
    } catch (e) {
        localStorage.removeItem('user');
    }

    if (!user && !isPublicPage) {
        window.location.href = 'login.html';
        return;
    } else if (user && isAuthPage) {
        window.location.href = 'index.html';
        return;
    }

    // 2. Global Logout Function
    window.logout = function(e) {
        if (e) e.preventDefault();
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    };

    // 3. Dynamic Navigation, Backgrounds, & Footer
    document.addEventListener("DOMContentLoaded", () => {
        // Upgrade navbar links
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            if (user) {
                const initial = (user.username && user.username.length > 0) ? user.username.charAt(0).toUpperCase() : 'U';
                const adminLink = user.isAdmin ? `<a href="admin.html">🛡️ Admin Portal</a>` : '';
                navLinks.innerHTML = `
                    <a href="index.html">Home</a>
                    <a href="about_us.html">About Us</a>
                    <div class="user-profile-badge">
                        <div class="profile-avatar">${initial}</div>
                        <span class="profile-name">Hi, ${user.username || 'User'}</span>
                        <div class="profile-dropdown">
                            <a href="profile.html">🌌 Profile</a>
                            ${adminLink}
                            <a href="#" onclick="logout(event)">🚀 Logout</a>
                        </div>
                    </div>
                `;
            } else {
                navLinks.innerHTML = `
                    <a href="index.html">Home</a>
                    <a href="about_us.html">About Us</a>
                    <a href="login.html">Login</a>
                    <a href="register.html" class="btn-register">Register</a>
                `;
            }
        }

        // Initialize Space nebula background
        if (!document.querySelector('.nebula-bg')) {
            const nebula = document.createElement("div");
            nebula.className = "nebula-bg";
            document.body.appendChild(nebula);
        }

        // Initialize Interactive Starfield Canvas
        initStarfield();

        // Inject dynamic footer
        injectFooter();

        // Initialize 3D Interactive Card Tilt Effect
        init3DTilt();
    });

    // 4. Interactive Starfield Canvas Simulation
    function initStarfield() {
        if (document.getElementById('starfield')) return;
        const canvas = document.createElement('canvas');
        canvas.id = 'starfield';
        document.body.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        
        const particles = [];
        const particleCount = Math.min(100, Math.floor((width * height) / 14000)); // Adaptive count
        const connectionDist = 110;
        
        let mouse = { x: null, y: null, radius: 160 };
        
        window.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });
        
        window.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });
        
        window.addEventListener('resize', () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        });
        
        class Particle {
            constructor() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.vx = (Math.random() - 0.5) * 0.4;
                this.vy = (Math.random() - 0.5) * 0.4;
                this.radius = Math.random() * 1.5 + 0.8;
                this.baseRadius = this.radius;
            }
            
            update() {
                this.x += this.vx;
                this.y += this.vy;
                
                if (this.x < 0 || this.x > width) this.vx *= -1;
                if (this.y < 0 || this.y > height) this.vy *= -1;
                
                // Particle physics interaction with cursor
                if (mouse.x !== null && mouse.y !== null) {
                    const dx = mouse.x - this.x;
                    const dy = mouse.y - this.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (dist < mouse.radius) {
                        const force = (mouse.radius - dist) / mouse.radius;
                        const angle = Math.atan2(dy, dx);
                        // Repel particles
                        this.x -= Math.cos(angle) * force * 1.5;
                        this.y -= Math.sin(angle) * force * 1.5;
                        this.radius = this.baseRadius + force * 2.5;
                    } else {
                        if (this.radius > this.baseRadius) this.radius -= 0.1;
                    }
                } else {
                    if (this.radius > this.baseRadius) this.radius -= 0.1;
                }
            }
            
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 215, 0, ${0.3 + (this.radius - this.baseRadius) * 0.25})`; // golden shimmer
                ctx.fill();
            }
        }
        
        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }
        
        function animate() {
            ctx.clearRect(0, 0, width, height);
            
            for (let p of particles) {
                p.update();
                p.draw();
            }
            
            // Render thin connection links between adjacent particles
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    
                    if (dist < connectionDist) {
                        const alpha = (connectionDist - dist) / connectionDist * 0.18;
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
                        ctx.lineWidth = 0.8;
                        ctx.stroke();
                    }
                }
            }
            
            requestAnimationFrame(animate);
        }
        
        animate();
    }

    // 5. Dynamic Footer Injection
    function injectFooter() {
        if (document.querySelector('footer')) return;
        const footer = document.createElement('footer');
        footer.innerHTML = `
            <div class="footer-container">
                <div class="footer-brand">
                    <a href="index.html" class="logo">
                        <div class="logo-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10" stroke="url(#footerLogoGrad)" stroke-width="2"/>
                                <circle cx="12" cy="12" r="4" fill="url(#footerLogoGrad)"/>
                                <path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="url(#footerLogoGrad)" stroke-width="1.5"/>
                                <defs>
                                    <linearGradient id="footerLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stop-color="#fff176" />
                                        <stop offset="50%" stop-color="#ffd700" />
                                        <stop offset="100%" stop-color="#ffb300" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        CINE<span>SPHERE</span>
                    </a>
                    <p class="footer-desc">Experience the future of cinema booking. Search movies, reserve premium IMAX seats, order galactic concessions, and discuss masterpieces in our cinematic community.</p>
                    <div class="social-links">
                        <a href="#" aria-label="Twitter">🐦</a>
                        <a href="#" aria-label="Instagram">📸</a>
                        <a href="#" aria-label="YouTube">🎥</a>
                        <a href="#" aria-label="GitHub">💻</a>
                    </div>
                </div>
                <div class="footer-links-group">
                    <div class="footer-col">
                        <h4>Navigation</h4>
                        <a href="index.html">Home</a>
                        <a href="book_tickets.html">Tickets</a>
                        <a href="movie_info.html">Discovery</a>
                        <a href="snacks.html">Snacks</a>
                        <a href="reviews.html">Reviews</a>
                    </div>
                    <div class="footer-col">
                        <h4>Portal Services</h4>
                        <a href="profile.html">My Account</a>
                        <a href="booking_portal.html">Secure Checkout</a>
                        <a href="about_us.html">About CineSphere</a>
                        <a href="#">Support Center</a>
                    </div>
                    <div class="footer-col">
                        <h4>Subscribe to Nebula</h4>
                        <p class="sub-text">Join our cosmic newsletter for exclusive movie news and ticket pre-sales.</p>
                        <form class="subscribe-form" onsubmit="event.preventDefault(); alert('Subscribed to the cosmic news!');">
                            <input type="email" placeholder="Your space mail" required class="sub-input">
                            <button type="submit" class="sub-btn">Join</button>
                        </form>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2026 CineSphere Portal. All rights reserved in the multiverse.</p>
                <div class="bottom-links">
                    <a href="#">Terms of Service</a>
                    <a href="#">Privacy Policy</a>
                    <a href="#">Cookie Settings</a>
                </div>
            </div>
        `;
        const scrollContainer = document.querySelector('.scroll-container');
        if (scrollContainer) {
            scrollContainer.appendChild(footer);
        } else {
            document.body.appendChild(footer);
        }
    }

    // 6. Global 3D Parallax Card Tilt Function
    function init3DTilt() {
        const tiltElements = document.querySelectorAll('.card, .snack-card, .history-card, .auth-box, .about-card, .review-form, .trending-card');
        tiltElements.forEach(el => {
            el.addEventListener('mousemove', (e) => {
                const rect = el.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                
                const rotateX = ((y - centerY) / centerY) * -8;
                const rotateY = ((x - centerX) / centerX) * 8;
                
                el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            });

            el.addEventListener('mouseleave', () => {
                el.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
            });
        });
    }
})();
