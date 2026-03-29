document.addEventListener('DOMContentLoaded', () => {
    let currentMember = null;
    const audioPlayer = document.getElementById('audio-player');

    const redirect = () => {
        sessionStorage.setItem('devtools_detected', 'true');
        window.location.href = 'about:blank';
    };

    if (sessionStorage.getItem('devtools_detected') === 'true' || 
        document.referrer === 'about:blank') {
        redirect();
        return;
    }

    const devtoolsDetector = () => {
        const threshold = 160;
        if (window.outerWidth - window.innerWidth > threshold || 
            window.outerHeight - window.innerHeight > threshold) {
            redirect();
        }
    };

    const debuggerCheck = () => {
        const start = performance.now();
        debugger;
        const end = performance.now();
        if (end - start > 100) redirect();
    };

    window.addEventListener('resize', devtoolsDetector);
    setInterval(devtoolsDetector, 500);
    setInterval(debuggerCheck, 1000);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || e.keyCode === 123 ||
            (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(e.key)) ||
            (e.ctrlKey && e.key === 'U') ||
            (e.metaKey && e.altKey && ['I', 'J', 'C'].includes(e.key))) {
            e.preventDefault();
            redirect();
        }
    });

    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    (function() {
        const element = new Image();
        Object.defineProperty(element, 'id', {
            get: function() {
                redirect();
            }
        });
        console.log(element);
    })();

    function isVideoPath(path) {
        return typeof path === 'string' && /\.(mp4|webm|ogg)$/i.test(path);
    }

    function getVideoMimeType(path) {
        const ext = (path.split('.').pop() || '').toLowerCase();
        if (ext === 'webm') return 'video/webm';
        if (ext === 'ogg') return 'video/ogg';
        return 'video/mp4';
    }

    function renderMemberMedia(src, name, memberId) {
        if (!src) return '';
        const avatarClass = memberId === 'nineoneone' ? 'fade-in member-avatar nineoneone-avatar' : 'fade-in member-avatar';
        
        if (isVideoPath(src)) {
            const type = getVideoMimeType(src);
            return `
                <video class="${avatarClass}" autoplay loop muted playsinline preload="metadata">
                    <source src="${src}" type="${type}">
                </video>
            `;
        }

        return `<img src="${src}" class="${avatarClass}" draggable="false" alt="${name}">`;
    }

    const memberInfoData = {
        evil: {
            name: 'EVIL',
            image: './assets/wtf.mp4',
            description: 'ihatecocacola',
            track: './assets/yoo.mp3'
        },
        nineoneone: {
            name: '911',
            image: './assets/911.mp4',
            description: 'where is emergency?',
            track: './assets/911.mp3'
        },
        psychokim: {
            name: 'psychokim',
            image: './assets/psychokim.mp4',
            description: '<p style="color:red">money money money</p>',
            track: './assets/psychokim.mp3'
        }
    };

    function showMember(member) {
        const info = memberInfoData[member];
        const memberDiv = document.getElementById('member-info');
        const selectedElement = document.querySelector(`[onclick="showMember('${member}')"]`);

        if (!info) return;

        if (currentMember) {
            currentMember.classList.remove('selected');
            resetDot(currentMember.getAttribute('data-member'));
            removeBackgroundVideo();
        }

        if (currentMember === selectedElement) {
            currentMember = null;
            memberDiv.innerHTML = '';
            resetMusic();
            return;
        }

        if (selectedElement) {
            selectedElement.classList.add('selected');
            selectedElement.setAttribute('data-member', member);
            currentMember = selectedElement;
        } else {
            return;
        }

        updateDots(member);

        if (member === 'nineoneone' || member === 'evil' || member === 'psychokim') {
            showBackgroundVideo(info.image, member);
            memberDiv.innerHTML = `
                <p class="member-name">[ ${info.name} ]</p>
                <hr class="member-separator">
                <p class="glitch member-description">${info.description}</p>
            `;
        } else {
            const mediaHtml = renderMemberMedia(info.image, info.name, member);
            memberDiv.innerHTML = `
                ${mediaHtml}
                <p class="member-name">[ ${info.name} ]</p>
                <hr class="member-separator">
                <p class="glitch member-description">${info.description}</p>
            `;
        }

        playMemberMusic(info.track);
    }

    function showBackgroundVideo(src, memberId) {
        removeBackgroundVideo();
        const videoContainer = document.createElement('div');
        videoContainer.id = 'background-video-container';
        videoContainer.className = `background-video-container ${memberId}-bg`;
        
        if (isVideoPath(src)) {
            const type = getVideoMimeType(src);
            videoContainer.innerHTML = `
                <video class="background-video" autoplay loop muted playsinline preload="metadata">
                    <source src="${src}" type="${type}">
                </video>
            `;
        }
        
        document.body.insertBefore(videoContainer, document.body.firstChild);
    }

    function removeBackgroundVideo() {
        const existing = document.getElementById('background-video-container');
        if (existing) existing.remove();
    }

    function playMemberMusic(track) {
        if (!track) return;
        const trackUrl = new URL(track, window.location.href).href;
        if (audioPlayer.src !== trackUrl) {
            audioPlayer.src = track;
            audioPlayer.play();
        }
    }

    function resetMusic() {
        const defaultTrack = './assets/main_menu.mp3';
        const defaultUrl = new URL(defaultTrack, window.location.href).href;
        if (audioPlayer.src !== defaultUrl) {
            audioPlayer.src = defaultTrack;
            audioPlayer.play();
        }
        removeBackgroundVideo();
    }

    function removeOverlay() {
        const overlay = document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
        audioPlayer.play().catch(err => console.log('Audio play failed:', err));
    }

    function resetDot(memberId) {
        const previousDot = document.getElementById(`${memberId}-dot`);
        if (previousDot) previousDot.innerHTML = '::';
    }

    function updateDots(member) {
        document.querySelectorAll('.yellow').forEach(dot => {
            dot.innerHTML = '::';
        });
        const currentDot = document.getElementById(`${member}-dot`);
        if (currentDot) currentDot.innerHTML = '<span class="red">•</span>';
    }

    window.removeOverlay = removeOverlay;
    window.showMember = showMember;
});
