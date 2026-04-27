# 🚀 Vlynxly Premium — Deployment Guide

I have modernized your app to be cloud-ready. To launch it for actual users, follow these steps:

## 1. Supabase Setup (Database & Storage)
1. Go to [Supabase.com](https://supabase.com) and create a new project.
2. **Database**: Copy your `Project URL` and `API Key` (service_role) and the `Database Connection String`.
3. **Storage**:
   - Go to "Storage" in Supabase.
   - Create a **Public** bucket named `vlynxly-media`.
   - Add three folders inside: `chat`, `memories`, `avatars`, and `voice`.

## 2. Initialize Online Database
1. Update your local [.env](file:///c:/projects/ros2/vlynxly-premium/backend/.env) briefly with your Supabase Connection String.
2. Run the initialization script:
   ```bash
   python .\scripts\production_setup.py
   ```
3. Once finished, you can revert your local `.env` if you want to keep testing locally.

## 3. Upload to GitHub
1. Create a **Private** repository on GitHub.
2. Push your `vlynxly-premium` folder to it:
   ```bash
   git init
   git add .
   git commit -m "Launch Vlynxly Premium"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

## 4. Hosting
*   **Backend (Render)**:
    - Create a new "Web Service" on [Render.com](https://render.com).
    - Connect your GitHub repo.
    - Set `STORAGE_MODE` to `supabase` and fill in your Supabase URL/Key in the Environment Variables.
*   **Frontend (Vercel)**:
    - Connect your GitHub repo to [Vercel](https://vercel.com).
    - Set the `VITE_API_URL` to your Render app URL.

---
**Your app is now cloud-ready and privacy-secured!**
