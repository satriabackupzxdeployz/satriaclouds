let GOOGLE_CLIENT_ID = null;
let currentUser = null;
let selectedFiles = [];
let currentFile = null;
let moveTarget = null;
let currentPath = 'root';
let files = [];

window.addEventListener('load', async function() {
    setTimeout(() => { 
        if(document.getElementById('loadingScreen')) {
            document.getElementById('loadingScreen').classList.add('hidden'); 
        }
    }, 1000);
    
    const storedUser = localStorage.getItem('satria_user');
    const path = window.location.pathname;

    if (path === '/home') {
        if (!storedUser) {
            window.location.replace('/');
            return;
        }
        localStorage.setItem('last_valid_page', '/home');
        currentUser = JSON.parse(storedUser);
        const appContainer = document.getElementById('appContainer');
        if(appContainer) appContainer.style.display = 'block';
        updateUserInterface();
        loadFilesLocal();
        renderFiles();
        updatePathUI();
    } else if (path === '/') {
        localStorage.setItem('last_valid_page', '/');
        try {
            const configRes = await fetch('/api/index');
            const configData = await configRes.json();
            GOOGLE_CLIENT_ID = configData.googleClientId;
            initGoogleAuth();
        } catch (e) {
            showToast('Koneksi server gagal', 'error');
        }
    }
});

function initGoogleAuth() {
    if (typeof google === 'undefined' || !google.accounts || !GOOGLE_CLIENT_ID) return;
    try {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
            auto_select: false,
            context: 'signin',
            ux_mode: 'popup'
        });
        
        const btnContainer = document.getElementById('googleSignInContainer');
        if(btnContainer) {
            google.accounts.id.renderButton(
                btnContainer,
                { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' }
            );
        }
    } catch (error) {
        showToast('Gagal memuat Google Login', 'error');
    }
}

function handleGoogleResponse(response) {
    if (!response || !response.credential) return;
    try {
        const userData = parseJwt(response.credential);
        const user = {
            name: userData.name, 
            email: userData.email,
            picture: userData.picture || '', 
            sub: userData.sub,
            avatar: userData.name.charAt(0).toUpperCase()
        };
        localStorage.setItem('satria_user', JSON.stringify(user));
        logAction('Login', 'Berhasil login', user.email);
        window.location.replace('/home');
    } catch (error) {
        showToast('Login gagal', 'error');
    }
}

function logout() {
    localStorage.removeItem('satria_user');
    window.location.replace('/');
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (error) { return null; }
}

function updateUserInterface() {
    if(!currentUser) return;
    const profileBtn = document.getElementById('profileBtn');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    
    if(profileBtn) profileBtn.textContent = currentUser.avatar;
    if(sidebarAvatar) sidebarAvatar.textContent = currentUser.avatar;
    
    if (currentUser.picture) {
        if(profileBtn) {
            profileBtn.style.backgroundImage = `url('${currentUser.picture}')`;
            profileBtn.style.color = 'transparent';
        }
        if(sidebarAvatar) {
            sidebarAvatar.style.backgroundImage = `url('${currentUser.picture}')`;
            sidebarAvatar.style.color = 'transparent';
        }
    }

    const sName = document.getElementById('sidebarName');
    const sEmail = document.getElementById('sidebarEmail');
    const pName = document.getElementById('profileName');
    const pEmail = document.getElementById('profileEmail');

    if(sName) sName.textContent = currentUser.name;
    if(sEmail) sEmail.textContent = currentUser.email;
    if(pName) pName.value = currentUser.name;
    if(pEmail) pEmail.value = currentUser.email;
}

async function logAction(action, details, forceEmail = null) {
    try {
        const userEmail = forceEmail || (currentUser ? currentUser.email : 'Unknown');
        await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: action, 
                account: userEmail,
                details: details
            })
        });
    } catch(e) {}
}

function renderFiles() {
    const grid = document.getElementById('filesGrid');
    if(!grid) return;
    const currentFiles = files.filter(f => f.path === currentPath);
    
    if (currentFiles.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>Tidak ada file</h3>
                <p>Upload file atau buat folder baru di sini</p>
            </div>
        `;
        return;
    }

    let html = '';
    currentFiles.forEach(file => {
        let dblClickAction = file.type === 'folder' ? `ondblclick="openFolder('${file.id}', '${file.name}')"` : '';
        html += `
            <div class="file-item" data-id="${file.id}" ${dblClickAction}>
                <input type="checkbox" class="file-checkbox" data-id="${file.id}" onchange="toggleFileSelection('${file.id}')">
                <div class="file-icon"><i class="fas ${file.icon}"></i></div>
                <div class="file-details">
                    <div class="file-name" title="${file.name}">${file.name.length > 15 ? file.name.substring(0,15)+'...' : file.name}</div>
                    <div class="file-info"><span>${file.size}</span><span>${file.modified}</span></div>
                </div>
                <button class="file-menu-btn" onclick="showFileMenu(event, '${file.id}')"><i class="fas fa-ellipsis-v"></i></button>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function openFolder(id, name) {
    currentPath = id;
    renderFiles();
    updatePathUI(name);
}

function updatePathUI(folderName = 'Root') {
    const bar = document.getElementById('pathBar');
    if(!bar) return;
    if (currentPath === 'root') {
        bar.innerHTML = `
            <div class="path-item" onclick="navigateTo('root')"><i class="fas fa-home"></i></div>
            <i class="fas fa-chevron-right path-separator"></i><div class="path-item">Root</div>
        `;
    } else {
        bar.innerHTML = `
            <div class="path-item" onclick="navigateTo('root')"><i class="fas fa-home"></i></div>
            <i class="fas fa-chevron-right path-separator"></i><div class="path-item">${folderName}</div>
        `;
    }
}

function navigateTo(path) {
    currentPath = path;
    renderFiles();
    updatePathUI();
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        if(sidebar) sidebar.classList.remove('active');
        if(overlay) overlay.classList.remove('active');
    }
}

function toggleFileSelection(id) {
    const checkbox = event.target;
    if (checkbox.checked) { if (!selectedFiles.includes(id)) selectedFiles.push(id); } 
    else { selectedFiles = selectedFiles.filter(f => f !== id); }
}

function showFileMenu(event, fileId) {
    event.stopPropagation();
    const menu = document.getElementById('fileMenu');
    const rect = event.target.closest('button').getBoundingClientRect();
    currentFile = files.find(f => f.id === fileId);
    if(menu) {
        menu.style.top = rect.bottom + window.scrollY + 'px';
        menu.style.left = rect.left + 'px';
        menu.classList.add('show');
    }
    setTimeout(() => { document.addEventListener('click', hideFileMenu); }, 100);
}

function hideFileMenu() {
    const menu = document.getElementById('fileMenu');
    if(menu) menu.classList.remove('show');
    document.removeEventListener('click', hideFileMenu);
}

function openFile() {
    if (currentFile.type === 'folder') { openFolder(currentFile.id, currentFile.name); } 
    else { downloadFile(); }
    hideFileMenu();
}

function renameFile() {
    const renameInput = document.getElementById('renameInput');
    const renameModal = document.getElementById('renameModal');
    if(renameInput) renameInput.value = currentFile.name;
    if(renameModal) renameModal.classList.add('show');
    hideFileMenu();
}

function confirmRename() {
    const newName = document.getElementById('renameInput').value;
    if (newName && currentFile) {
        let oldName = currentFile.name;
        currentFile.name = newName;
        saveFilesLocal();
        renderFiles();
        closeModal('renameModal');
        logAction('Rename', `Renamed ${oldName} to ${newName}`);
        showToast('Nama berhasil diubah', 'success');
    }
}

function downloadFile() {
    if(currentFile.type === 'folder') {
        showToast('Tidak dapat mendownload folder langsung', 'error');
        return;
    }
    if(currentFile.blobUrl) {
        const a = document.createElement('a');
        a.href = currentFile.blobUrl;
        a.download = currentFile.name;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        logAction('Download', `Downloaded file: ${currentFile.name}`);
        showToast('Mendownload ' + currentFile.name, 'success');
    } else {
        showToast('File tidak tersedia secara lokal', 'error');
    }
    hideFileMenu();
}

function moveFile() {
    const folders = files.filter(f => f.type === 'folder');
    const folderList = document.getElementById('folderList');
    let html = '<div class="folder-item" onclick="selectMoveTarget(\'root\')"><i class="fas fa-folder"></i> Root</div>';
    folders.forEach(f => {
        if(f.id !== currentFile.id) {
            html += `<div class="folder-item" onclick="selectMoveTarget('${f.id}')"><i class="fas fa-folder"></i> ${f.name}</div>`;
        }
    });
    if(folderList) folderList.innerHTML = html;
    const moveModal = document.getElementById('moveModal');
    if(moveModal) moveModal.classList.add('show');
    hideFileMenu();
}

function moveSelected() {
    if (selectedFiles.length === 0) { showToast('Pilih file terlebih dahulu', 'error'); return; }
    const folders = files.filter(f => f.type === 'folder');
    const folderList = document.getElementById('folderList');
    let html = '<div class="folder-item" onclick="selectMoveTarget(\'root\')"><i class="fas fa-folder"></i> Root</div>';
    folders.forEach(f => {
        if(!selectedFiles.includes(f.id)) {
            html += `<div class="folder-item" onclick="selectMoveTarget('${f.id}')"><i class="fas fa-folder"></i> ${f.name}</div>`;
        }
    });
    if(folderList) folderList.innerHTML = html;
    const moveModal = document.getElementById('moveModal');
    if(moveModal) moveModal.classList.add('show');
}

function selectMoveTarget(folderId) {
    moveTarget = folderId;
    document.querySelectorAll('.folder-item').forEach(item => item.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
}

function confirmMove() {
    if (moveTarget) {
        if(currentFile && selectedFiles.length === 0) {
            currentFile.path = moveTarget;
            logAction('Move', `Moved ${currentFile.name} to ${moveTarget}`);
        } else {
            const selected = files.filter(f => selectedFiles.includes(f.id));
            selected.forEach(file => { file.path = moveTarget; });
            logAction('Move', `Moved ${selectedFiles.length} files to ${moveTarget}`);
        }
        selectedFiles = [];
        saveFilesLocal();
        renderFiles();
        closeModal('moveModal');
        showToast('File berhasil dipindahkan', 'success');
        moveTarget = null;
        currentFile = null;
    }
}

function deleteFile() {
    const deleteModal = document.getElementById('deleteModal');
    if(deleteModal) deleteModal.classList.add('show');
    hideFileMenu();
}

function confirmDelete() {
    if (currentFile) {
        files = files.filter(f => f.id !== currentFile.id);
        selectedFiles = selectedFiles.filter(id => id !== currentFile.id);
        saveFilesLocal();
        renderFiles();
        closeModal('deleteModal');
        logAction('Delete', `Deleted file: ${currentFile.name}`);
        showToast('File berhasil dihapus', 'success');
        currentFile = null;
    }
}

function openNewFolderModal() {
    const folderModal = document.getElementById('newFolderModal');
    const folderName = document.getElementById('folderName');
    if(folderModal) folderModal.classList.add('show');
    if(folderName) folderName.value = 'Folder Baru';
}

function createFolder() {
    const name = document.getElementById('folderName').value;
    if (name) {
        const newFolder = {
            id: 'f_' + Date.now().toString(), name: name, type: 'folder',
            size: '-', modified: 'Baru saja', icon: 'fa-folder', path: currentPath
        };
        files.unshift(newFolder);
        saveFilesLocal();
        renderFiles();
        closeModal('newFolderModal');
        logAction('Create Folder', `Created folder: ${name} in ${currentPath}`);
        showToast('Folder ' + name + ' berhasil dibuat', 'success');
    }
}

function ensureDirectoryExists(relativePath, startPath) {
    if (!relativePath || !relativePath.includes('/')) return startPath;
    const parts = relativePath.split('/');
    parts.pop();
    let currentParent = startPath;

    for (let i = 0; i < parts.length; i++) {
        const folderName = parts[i];
        let existingFolder = files.find(f => f.type === 'folder' && f.name === folderName && f.path === currentParent);

        if (!existingFolder) {
            const newFolderId = 'f_' + Date.now().toString() + Math.random().toString(36).substr(2, 5);
            existingFolder = {
                id: newFolderId,
                name: folderName,
                type: 'folder',
                size: '-',
                modified: new Date().toLocaleDateString('id-ID'),
                icon: 'fa-folder',
                path: currentParent
            };
            files.unshift(existingFolder);
        }
        currentParent = existingFolder.id;
    }
    return currentParent;
}

function openUploadModal() { 
    const uModal = document.getElementById('uploadModal');
    if(uModal) uModal.classList.add('show'); 
}

async function uploadFiles(filesList) {
    showToast('Mengupload ' + filesList.length + ' item...', 'success');
    
    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const targetPath = ensureDirectoryExists(file.webkitRelativePath, currentPath);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('account', currentUser.email);

        try {
            const response = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await response.json();
            
            if(data.success) {
                const newFile = {
                    id: data.fileId, 
                    name: file.name,
                    type: file.type ? file.type.split('/')[0] : 'file', 
                    size: formatBytes(file.size),
                    modified: new Date().toLocaleDateString('id-ID'),
                    icon: getFileIcon(file.name), 
                    path: targetPath, 
                    blobUrl: data.url 
                };
                files.unshift(newFile);
                saveFilesLocal();
            }
        } catch (e) {
            showToast('Gagal mengupload ' + file.name, 'error');
        }
    }
    
    renderFiles();
    closeModal('uploadModal');
    showToast('Upload selesai', 'success');
}

async function uploadProfilePic(file) {
    if(!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('account', currentUser.email);

    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await response.json();
        if(data.success) {
            currentUser.picture = data.url;
            localStorage.setItem('satria_user', JSON.stringify(currentUser));
            updateUserInterface();
            logAction('Profile Picture', `Updated profile picture`);
            showToast('Foto profil berhasil diubah', 'success');
        }
    } catch (e) { showToast('Gagal mengubah foto', 'error'); }
}

function openProfileModal() { 
    const pModal = document.getElementById('profileModal');
    if(pModal) pModal.classList.add('show'); 
}

function openAboutModal() { 
    const aModal = document.getElementById('aboutModal');
    if(aModal) aModal.classList.add('show'); 
}

function closeModal(modalId) { 
    const mod = document.getElementById(modalId);
    if(mod) mod.classList.remove('show'); 
}

function showToast(message, type) {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
    toast.className = 'toast ' + type;
    toast.style.display = 'flex';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        'pdf': 'fa-file-pdf', 'jpg': 'fa-file-image', 'jpeg': 'fa-file-image',
        'png': 'fa-file-image', 'gif': 'fa-file-image', 'webp': 'fa-file-image',
        'mp4': 'fa-file-video', 'mkv': 'fa-file-video', 'avi': 'fa-file-video',
        'mp3': 'fa-file-audio', 'wav': 'fa-file-audio', 'ogg': 'fa-file-audio',
        'zip': 'fa-file-zipper', 'rar': 'fa-file-zipper', '7z': 'fa-file-zipper',
        'doc': 'fa-file-word', 'docx': 'fa-file-word',
        'xls': 'fa-file-excel', 'xlsx': 'fa-file-excel',
        'ppt': 'fa-file-powerpoint', 'pptx': 'fa-file-powerpoint',
        'txt': 'fa-file-lines', 'js': 'fa-file-code', 'html': 'fa-file-code', 'css': 'fa-file-code'
    };
    return icons[ext] || 'fa-file';
}

function saveFilesLocal() {
    localStorage.setItem('satria_files_' + currentUser.email, JSON.stringify(files));
}

function loadFilesLocal() {
    const stored = localStorage.getItem('satria_files_' + currentUser.email);
    if(stored) files = JSON.parse(stored);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar) sidebar.classList.toggle('active');
    if(overlay) overlay.classList.toggle('active');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.file-menu-btn')) {
        const menu = document.getElementById('fileMenu');
        if(menu) menu.classList.remove('show');
    }
});let