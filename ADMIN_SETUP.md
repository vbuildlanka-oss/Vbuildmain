# Admin setup: Supabase + Cloudflare R2

The site has an editor at **`/admin`**:

- **Supabase** stores the text and lists, and handles the admin login.
- **Cloudflare R2** stores uploaded images.
- **A scheduled ping** keeps the free Supabase project from pausing.

Until the setup below is done, the site keeps working and shows the content it ships with.

Allow about 20 minutes. Do the parts in order.

---

## Part 1 — Supabase (content + login)

1. **Create the project.**
   1. Sign in at [supabase.com/dashboard](https://supabase.com/dashboard) and choose **New project**.
   2. Pick the free plan and a region near your visitors.
   3. Set a database password and save it in your password manager. You won't need it for the site.
   4. Wait the minute or two until the project is ready.
2. **Create the tables.**
   1. In the left sidebar, open **SQL Editor** and choose **New query**.
   2. Paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and press **Run**. It should say _Success. No rows returned_.
   3. It's safe to run again later.
3. **Create your login.**
   1. Go to **Authentication → Users → Add user → Create new user**.
   2. Enter your email and a strong password.
   3. Tick **Auto Confirm User** and choose **Create user**.
4. **Make that account an admin.** Back in the **SQL Editor**, open a new query, put your email in, and run:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'vbuildlanka@gmail.com'
   on conflict do nothing;
   ```
5. **Turn off public sign-ups**, so nobody else can create an account.
   - Go to **Authentication → Sign In / Providers**.
   - Under _User Signups_, switch off **Allow new users to sign up** and save.
   - Even if this were left on, only accounts in the `admins` table can edit. This is a second layer.
6. **Set the site address**, so password-reset emails link back correctly.
   - Go to **Authentication → URL Configuration**.
   - Set **Site URL** to your live address, for example `https://vbuild.dev`.
   - Add `https://vbuild.dev/admin` under **Redirect URLs**.
7. **Copy two values for later.** Click **Connect** at the top of the project, or open **Project Settings → API Keys**. Copy:
   - **Project URL**: `https://xxxxxxxx.supabase.co`
   - **Publishable key**: `sb_publishable_…`. On older projects, use the **anon public** key under _Legacy API keys_ instead.

   > ⚠️ Never copy the **secret** or **service_role** key anywhere. The site doesn't need it.

---

## Part 2 — Cloudflare R2 (image storage)

1. **Turn on R2.**
   1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
   2. Open **R2 Object Storage** (under _Storage & Databases_).
   3. If asked, add a payment method. The free tier includes 10 GB of storage and no download fees; you're only charged above it.
2. **Create a bucket.** Choose **Create bucket**, name it `vbuild-media`, leave the location on _Automatic_, and create it.
3. **Make the images public.** Open the bucket, go to **Settings → Public access**, and pick one option:
   - **Recommended: Custom Domain.** Use this if your domain is on Cloudflare. Choose **Connect Domain** and enter something like `media.vbuild.dev`. Your public URL is `https://media.vbuild.dev`.
   - **Quick start: Public Development URL.** Choose **Allow** to get a `https://pub-….r2.dev` address. Cloudflare rate-limits these, so switch to a custom domain before real traffic.

   Write down the public URL.

4. **Create an access key.**
   1. Go back to **R2 Object Storage**. Under **Account details**, next to _API Tokens_, choose **Manage**, then **Create API token** (an _Account API token_).
   2. Name it `vbuild-site-uploads`.
   3. Set **Permissions** to **Object Read & Write**.
   4. Under **Specify bucket(s)**, choose **Apply to specific buckets only → `vbuild-media`**.
   5. Leave **TTL** on _Forever_ and create the token.
   6. Copy the **Access Key ID** and **Secret Access Key** now. The secret is shown only once.
5. **Copy your Account ID.** It's under **Account details** on the R2 overview page. It's also in the S3 endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

You don't need any CORS rules. Uploads go through the site's own `/api/upload` function, which checks that you're a signed-in admin before passing the image to R2.

---

## Part 3 — Vercel (connect everything)

1. In [vercel.com](https://vercel.com), open the **vbuildmain** project and go to **Settings → Environment Variables**.
2. Add each of these with **Production** and **Preview** ticked:

   | Name                     | Value                                                               |
   | ------------------------ | ------------------------------------------------------------------- |
   | `VITE_SUPABASE_URL`      | Supabase **Project URL** (Part 1, step 7)                           |
   | `VITE_SUPABASE_ANON_KEY` | Supabase **publishable** (or anon) key                              |
   | `R2_ACCOUNT_ID`          | Cloudflare **Account ID**                                           |
   | `R2_ACCESS_KEY_ID`       | R2 **Access Key ID**                                                |
   | `R2_SECRET_ACCESS_KEY`   | R2 **Secret Access Key**                                            |
   | `R2_BUCKET`              | `vbuild-media`                                                      |
   | `R2_PUBLIC_URL`          | Public bucket URL from Part 2, step 3, with no trailing slash       |
   | `CRON_SECRET`            | Any random string of 32+ characters, e.g. from a password generator |

3. **Redeploy.** Go to **Deployments**, open the latest one, choose **⋯ → Redeploy**. The `VITE_` values are baked in at build time, so a redeploy is required.
4. **Check the cron job.** Go to **Settings → Cron Jobs**. You should see `/api/keep-alive` scheduled daily.

---

## Part 4 — GitHub (backup keep-alive)

Supabase likes to see a few database requests every day:

- Vercel pings **once a day**.
- This GitHub workflow pings **every 6 hours** as well.

To set it up:

1. On GitHub, open **vbuildlanka-oss/Vbuildmain → Settings → Secrets and variables → Actions → New repository secret**.
2. Add these two secrets:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_ANON_KEY`: the publishable (or anon) key
3. Open the **Actions** tab, choose **Supabase keep-alive → Run workflow**, and check that it goes green.

---

## Part 5 — First sign-in

1. Open `https://<your-site>/admin` and sign in with the account from Part 1, step 3.
2. The **Overview** should show:
   - **Supabase keep-alive** with a recent ping. Press **Ping now** to test it.
   - **Image uploads: Connected**.
3. Make a small edit and press **Publish**. That first publish copies the current site content into Supabase. From then on, the site reads from there.

---

## Day-to-day use

- **Edit:** choose a section in the left menu. Every page's text, links and images are there.
- **Preview:** shows the page with your unpublished changes in another tab. It refreshes as you type.
- **Publish:** makes changes live. New visitors see them right away, with no redeploy.
- **Add a project:** go to **Projects → New project**.
  1. Type a title. The page address is made from it.
  2. Optionally start from a copy of an existing project.
  3. Fill in the fields and drop in a cover image. Images are resized and converted to WebP automatically.
  4. Switch **Show on the site** on, then **Publish**.
  5. New projects start as drafts, so you can work on them without anyone seeing.
- **Undo:** **History & backups** keeps the last 50 published versions. Load one into the editor and publish it to roll back. You can also download a JSON backup.

## Troubleshooting

- **"Connect Supabase first" on `/admin`:** the `VITE_` variables are missing, or you haven't redeployed since adding them.
- **"No editing access":** run the `insert into public.admins …` statement from Part 1, step 4 with the exact email you signed in with.
- **Uploads say "R2 isn't configured":** one of the `R2_*` variables is missing. Redeploy after adding it.
- **Uploads fail with 403 from R2:** the API token isn't scoped to `vbuild-media` or lacks _Object Read & Write_.
- **Images upload but don't display:** `R2_PUBLIC_URL` doesn't match the bucket's public URL, or public access is off.
- **Supabase paused anyway:** open the project in the Supabase dashboard and choose **Resume**. Your data is kept. Then check Vercel → Cron Jobs and the GitHub Actions run history.
- **Local development:** copy `.env.example` to `.env.local`. `npm run dev` runs the site and admin. `/api/*` only runs on Vercel, or locally with `vercel dev`.
