// Firebase & Cloud Services Configuration for RCSC
const firebaseConfig = {
  apiKey: "AIzaSyDvQ7Ao-4cqn7z5SyFgs2HRU9jq50O9CsY",
  authDomain: "rcsc-website-0.firebaseapp.com",
  projectId: "rcsc-website-0",
  storageBucket: "rcsc-website-0.firebasestorage.app",
  messagingSenderId: "155897164113",
  appId: "1:155897164113:web:c7c33f3a923d581b6fa370"
};

// Initialize Firebase
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const db = (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;
const IMGBB_API_KEY = "f73b05d92b0342142fd862a26d0ed40e";

/**
 * Uploads an image File or Base64 string to ImgBB and returns the public CDN URL.
 * @param {File|Blob|string} imageInput
 * @returns {Promise<string>} Direct image URL (e.g. https://i.ibb.co/...)
 */
async function uploadToImgBB(imageInput) {
  if (!imageInput) throw new Error("No image provided");
  const formData = new FormData();
  if (typeof imageInput === 'string') {
    // If base64 data URL, extract the base64 part
    const clean = imageInput.replace(/^data:image\/[a-z]+;base64,/, '');
    formData.append('image', clean);
  } else {
    formData.append('image', imageInput);
  }

  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData
  });

  const data = await res.json();
  if (data && data.success && data.data) {
    return data.data.display_url || data.data.url;
  } else {
    throw new Error(data?.error?.message || "Image upload failed");
  }
}
