/**
 * firebase/config.js
 * ────────────────────────────────────────────────────────────────
 * Khởi tạo Firebase và export các SDK functions.
 *
 * PATTERN: Dùng window._fb_init (CDN custom loader) thay vì
 * import trực tiếp từ 'firebase/app' vì Firebase đang load qua CDN.
 *
 * Để chuyển sang ES Module Firebase SDK thật:
 *   1. Thêm <script type="importmap"> vào index.html
 *   2. Thay window._fb_init bằng import { initializeApp } from 'firebase/app'
 *   3. Đây là PHASE 3 (future) — cần test kỹ trước khi thực hiện
 *
 * /// NEW ARCHITECTURE — trích từ app.js dòng 111–129
 * ────────────────────────────────────────────────────────────────
 */

import { store } from '../store.js';

const firebaseConfig = {
    apiKey:            'AIzaSyBfxbFrMabJHbARXpAqStIrSFlSAcCxgGY',
    authDomain:        'quanly-tst.firebaseapp.com',
    projectId:         'quanly-tst',
    storageBucket:     'quanly-tst.firebasestorage.app',
    messagingSenderId: '981970279440',
    appId:             '1:981970279440:web:8ac137ec4f72a39faa7e95',
    measurementId:     'G-Z1M9YYDZL1',
};

/**
 * Khởi tạo Firebase app, Firestore, và Auth.
 * Lưu db và auth vào store để các module khác dùng chung.
 *
 * @returns {{ db, auth, secondaryAuth, sdkFns }}
 */
export function initFirebase() {
    const {
        initializeApp,
        getFirestore,
        getAuth,
        // Firestore functions
        collection, doc, getDoc, onSnapshot, addDoc, updateDoc,
        deleteDoc, query, orderBy, documentId, where, writeBatch, setDoc,
        arrayUnion, arrayRemove, getDocs, limit, increment, getCountFromServer,
        // Auth functions
        signInWithEmailAndPassword, signOut, onAuthStateChanged,
        createUserWithEmailAndPassword, sendPasswordResetEmail,
        updatePassword, reauthenticateWithCredential, EmailAuthProvider,
        signInAnonymously,
    } = window._fb_init;

    const app          = initializeApp(firebaseConfig);
    const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');

    store.db           = getFirestore(app);
    store.auth         = getAuth(app);
    store.secondaryAuth = getAuth(secondaryApp);

    // Export SDK functions dùng chung — modules import từ đây
    return {
        db:   store.db,
        auth: store.auth,
        secondaryAuth: store.secondaryAuth,
        sdk: {
            collection, doc, getDoc, onSnapshot, addDoc, updateDoc,
            deleteDoc, query, orderBy, documentId, where, writeBatch, setDoc,
            arrayUnion, arrayRemove, getDocs, limit, increment, getCountFromServer,
            signInWithEmailAndPassword, signOut, onAuthStateChanged,
            createUserWithEmailAndPassword, sendPasswordResetEmail,
            updatePassword, reauthenticateWithCredential, EmailAuthProvider,
            signInAnonymously,
        },
    };
}
