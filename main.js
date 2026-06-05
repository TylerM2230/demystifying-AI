document.addEventListener("DOMContentLoaded", () => {
    // ----------------------------------------------------
    // Intersection Observer for highlighting TOC 
    // ----------------------------------------------------
    const sections = document.querySelectorAll("section");
    const navLinks = document.querySelectorAll(".toc-link");

    const observerOptions = {
        root: null,
        rootMargin: "0px",
        threshold: 0.3
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const activeId = entry.target.id;
                navLinks.forEach(link => {
                    link.classList.remove("active");
                    if (link.getAttribute("href") === `#${activeId}`) {
                        link.classList.add("active");
                        if (window.innerWidth <= 1000) {
                            link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                        }
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(sec => observer.observe(sec));

    // ----------------------------------------------------
    // Three.js Tokenizer Visualizer (Vector Embeddings)
    // ----------------------------------------------------
    const inputField = document.getElementById("sandbox-input");
    const canvasWrapper = document.getElementById("canvas-wrapper");
    const labelsContainer = document.getElementById("labels-container");

    if (!inputField || !canvasWrapper || typeof THREE === "undefined") return;

    // Set up Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfceceb);

    const camera = new THREE.PerspectiveCamera(45, canvasWrapper.clientWidth / canvasWrapper.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, 20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
    canvasWrapper.appendChild(renderer.domElement);

    // Mount user mouse manipulation controls
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Handles resizing
    window.addEventListener('resize', () => {
        if(!canvasWrapper) return;
        camera.aspect = canvasWrapper.clientWidth / canvasWrapper.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvasWrapper.clientWidth, canvasWrapper.clientHeight);
    });

    // Setup 3D Axis Basis and Ambient Context
    const axesHelper = new THREE.AxesHelper(10);
    // Stark brutalist line colors (overriding vertex colors manually for r128 compatibility)
    const colors = axesHelper.geometry.attributes.color;
    for (let i = 0; i < colors.count; i++) {
        colors.setXYZ(i, 0, 0, 0);
    }
    scene.add(axesHelper);

    const gridHelper = new THREE.GridHelper(20, 20, 0x000000, 0x000000);
    gridHelper.material.opacity = 0.15;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    const tokenData = [];
    const colorPalette = [0xffc900, 0x90ff90, 0xff90e8];

    // Pseudo-random normalized vector derivation
    function getVectorFromHash(str) {
        let h1 = 0.5, h2 = 0.5, h3 = 0.5;
        for (let i = 0; i < str.length; i++) {
            let c = str.charCodeAt(i);
            h1 = Math.sin(h1 + c) * 10000; h1 = h1 - Math.floor(h1);
            h2 = Math.cos(h2 + c) * 10000; h2 = h2 - Math.floor(h2);
            h3 = Math.tan(h3 + c) * 10000; h3 = h3 - Math.floor(h3);
        }
        
        // Map to [-1, 1] range to spread across all 8 XYZ quadrants
        const x = h1 * 2 - 1;
        const y = h2 * 2 - 1;
        const z = h3 * 2 - 1;
        
        const vec = new THREE.Vector3(x, y, z).normalize();
        if(vec.length() === 0) vec.set(0,1,0); // Failsafe
        return vec;
    }

    function createVectorArrow(word, index, total) {
        let h = 0;
        for(let i=0; i<word.length; i++) h += word.charCodeAt(i);

        const dir = getVectorFromHash(word);
        
        const length = 4 + (h % 4); 
        const colHex = colorPalette[h % colorPalette.length];
        
        // 3D Dimensional Base Distribution - Vectors emanate radially from Semantic Zero
        const origin = new THREE.Vector3(0, 0, 0);

        // Render a single centralized anchor box for the origin base if it's the first word
        let originMesh = null;
        if (index === 0) {
            const geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
            const mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
            originMesh = new THREE.Mesh(geo, mat);
            originMesh.position.copy(origin);
            scene.add(originMesh);
        }
        
        // Utilize ArrowHelper for stark directional projection in true 3D
        const arrowHelper = new THREE.ArrowHelper(dir, origin, length, colHex, 1, 0.8);
        scene.add(arrowHelper);

        // Position the label slightly beyond the cone head
        const tipPos = new THREE.Vector3().copy(origin).add(dir.clone().multiplyScalar(length + 1.5));

        const label = document.createElement("div");
        label.className = "token-3d-label";
        const shortenedWord = word.length > 12 ? word.substring(0,10)+"..." : word;
        
        // Present floating coordinates to reinforce the mathematical thesis
        const coordTpl = `[${dir.x.toFixed(1)}, ${dir.y.toFixed(1)}, ${dir.z.toFixed(1)}]`;
        label.innerHTML = `"${shortenedWord}" <br/><span class="weight">${coordTpl}</span>`;
        labelsContainer.appendChild(label);

        tokenData.push({ arrow: arrowHelper, originMesh: originMesh, label: label, targetPos: tipPos });
    }

    let timeout;
    inputField.addEventListener("input", (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            const rawText = e.target.value.trim();
            
            // Clean up existing vectors rigorously
            tokenData.forEach(t => {
                if(t.arrow) scene.remove(t.arrow);
                if(t.originMesh) {
                    scene.remove(t.originMesh);
                    t.originMesh.geometry.dispose();
                    t.originMesh.material.dispose();
                }
                if(t.arrow && t.arrow.line) { t.arrow.line.geometry.dispose(); t.arrow.line.material.dispose(); }
                if(t.arrow && t.arrow.cone) { t.arrow.cone.geometry.dispose(); t.arrow.cone.material.dispose(); }
            });
            tokenData.length = 0;
            labelsContainer.innerHTML = "";

            if (!rawText) return;

            const words = rawText.split(/\s+/).filter(w => w.length > 0);
            words.forEach((word, index) => {
                createVectorArrow(word, index, words.length);
            });

        }, 50); 
    });

    function animate() {
        requestAnimationFrame(animate);

        // Required for smooth damping
        controls.update();

        tokenData.forEach(t => {
            const _vector = t.targetPos.clone();
            _vector.project(camera);

            // Re-map 3D coordinates locally to 2D CSS projection rules
            const x = (_vector.x * .5 + .5) * canvasWrapper.clientWidth;
            const y = (_vector.y * -.5 + .5) * canvasWrapper.clientHeight;

            t.label.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
            t.label.classList.add("visible");
        });

        renderer.render(scene, camera);
    }
    animate();
    
    // Check preset
    if(inputField.value) inputField.dispatchEvent(new Event("input"));

    // ----------------------------------------------------
    // Dark Mode Toggle Logic
    // ----------------------------------------------------
    const themeToggleBtn = document.getElementById("dark-mode-toggle");
    const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector("i") : null;
    
    function updateSceneBackground() {
        if (typeof scene !== "undefined" && scene) {
            if (document.body.classList.contains("dark-mode")) {
                scene.background = new THREE.Color(0x2a2a2a);
            } else {
                scene.background = new THREE.Color(0xfceceb);
            }
        }
    }

    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark-mode");
        if (themeIcon) {
            themeIcon.classList.remove("fa-moon");
            themeIcon.classList.add("fa-sun");
        }
        updateSceneBackground();
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener("click", () => {
            document.body.classList.toggle("dark-mode");
            if (document.body.classList.contains("dark-mode")) {
                localStorage.setItem("theme", "dark");
                if (themeIcon) {
                    themeIcon.classList.remove("fa-moon");
                    themeIcon.classList.add("fa-sun");
                }
            } else {
                localStorage.setItem("theme", "light");
                if (themeIcon) {
                    themeIcon.classList.remove("fa-sun");
                    themeIcon.classList.add("fa-moon");
                }
            }
            updateSceneBackground();
        });
    }
});
