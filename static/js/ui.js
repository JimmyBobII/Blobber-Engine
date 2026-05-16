const UI = {
    initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const viewSections = document.querySelectorAll('.view-section');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                tabBtns.forEach(b => b.classList.remove('active'));
                viewSections.forEach(v => v.classList.remove('active'));
                
                e.target.classList.add('active');
                
                const targetId = e.target.getAttribute('data-target');
                document.getElementById(targetId).classList.add('active');
                
                // Toggle top-bar save buttons per view
                const saveMapBtn = document.getElementById('save-map-btn');
                const testPlayBtn = document.getElementById('test-play-btn');
                const exportBtn = document.getElementById('export-game-btn');
                const saveDbBtn = document.getElementById('save-db-btn');

                if (targetId === 'view-map') {
                    if (saveMapBtn) saveMapBtn.style.display = '';
                    if (testPlayBtn) testPlayBtn.style.display = '';
                    if (exportBtn) exportBtn.style.display = '';
                    if (saveDbBtn) saveDbBtn.style.display = 'none';
                } else if (targetId === 'view-db') {
                    if (saveMapBtn) saveMapBtn.style.display = 'none';
                    if (testPlayBtn) testPlayBtn.style.display = 'none';
                    if (exportBtn) exportBtn.style.display = 'none';
                    if (saveDbBtn) saveDbBtn.style.display = '';
                }

                // Refresh music composer floor slots when entering DB view
                if (targetId === 'view-db' && typeof DbEditor !== 'undefined' && DbEditor.musicRefreshSlots) {
                    DbEditor.musicRefreshSlots();
                }
            });
        });
    },
    
    showStatus(elementId, message, isError = false) {
        const msgBox = document.getElementById(elementId);
        if (!msgBox) return;
        
        msgBox.innerText = message;
        msgBox.style.color = isError ? '#ff4444' : 'var(--accent-green)'; 
        
        setTimeout(() => {
            msgBox.innerText = '';
        }, 3000);
    },

    initDarkMode() {
        const toggle = document.getElementById('dark-toggle');
        if (!toggle) return;

        if (localStorage.getItem('inkstone-dark') === '1') {
            document.body.classList.add('dark-mode');
            toggle.innerHTML = '&#9788; Light';
        }

        toggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('inkstone-dark', isDark ? '1' : '0');
            toggle.innerHTML = isDark ? '&#9788; Light' : '&#9789; Dark';
        });
    },

    initCollapsibles() {
        // Sidebar collapsibles
        document.querySelectorAll('.sidebar-heading.collapsible').forEach(heading => {
            heading.addEventListener('click', () => {
                const arrow = heading.querySelector('.collapse-arrow');
                const content = heading.nextElementSibling;
                if (content && content.classList.contains('collapse-content')) {
                    content.classList.toggle('open');
                    if (arrow) arrow.classList.toggle('open');
                }
            });
        });

        // DB panel collapsibles
        document.querySelectorAll('.db-collapse-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const arrow = toggle.querySelector('.collapse-arrow');
                const body = toggle.nextElementSibling;
                if (body && body.classList.contains('db-collapse-body')) {
                    toggle.classList.toggle('open');
                    body.classList.toggle('open');
                    if (arrow) arrow.classList.toggle('open');
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    UI.initTabs();
    UI.initDarkMode();
    UI.initCollapsibles();
});
