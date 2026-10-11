# Your first ad with Content Chef

You’ll open the app, connect an assistant, give it your website and ask for an ad. You don’t need to know how to design or write code. Start with one picture; you can try videos and extra sizes later.

Already have Content Chef open? Skip to **2. Connect your assistant**. The same short walkthrough is in the launcher under **First time? Start here.**

## 1. Download and open the app

Open the [Content Chef downloads page](https://github.com/devyo1/ContentChef/releases). Find the latest published release and open its **Assets** list if the files are hidden.

**No files there yet?** An installer has not been published. Ask the person sharing Content Chef for the installer or wait for a release. The green **Code** button and the **Source code** ZIP are for developers; they won’t install the app.

### On Windows

1. Click the file whose name ends in **win-x64.exe**. This is the installer: the file that puts Content Chef on your computer.
2. When the download finishes, open your **Downloads** folder and double-click that file.
3. Follow the installation window. Keep the suggested choices unless you want a different folder.
4. Open **Content Chef** from your desktop shortcut or the Windows Start menu.
5. In the window that appears, click the orange **Open studio** button.

### On a Mac

1. Download the file ending in **.dmg** for your Mac. If multiple versions are listed, **arm64** is for Apple silicon (M1 or newer) and **x64** is for Intel. **Apple menu → About This Mac** shows which you have.
2. Open the downloaded file, then drag **Content Chef** into **Applications**.
3. Open **Applications**, double-click **Content Chef**, then click **Open studio**.

On Linux, download the **.AppImage**, allow it to run as a program in its file properties, then open it. The exact wording varies by system.

If installation is blocked or the app will not open, send the exact message to the person who supplied the installer so they can help with your computer’s setup.

## 2. Connect your assistant

This lets the app help with your brand, write the words and change your design. You only need to connect once.

1. Click **Settings** at the top of the studio.
2. Find **AI assistant**. Click the **Connect with** menu and choose **My ChatGPT account (via Codex)**. Codex is the connection Content Chef uses to work with your ChatGPT account.
3. If you see **Signed in with ChatGPT**, you’re ready. Otherwise, click **Sign in with ChatGPT**.
4. A browser window opens. Sign in to the ChatGPT account you want to use and finish the steps shown there.
5. Come back to Content Chef and click **Check again**. Look for **Signed in with ChatGPT**.

Leave **Model** and **Codex executable path** alone. You don’t need an API key. AI use counts toward your account’s Codex limits.

Prefer Claude? Choose **My Claude account (via Claude Code)** in the same menu and follow the sign-in instructions shown there.

### Want AI to make the background picture?

In **Create**, open **Look** and click **Create with AI** beside **Background**. Describe the picture you want, or enter a website for inspiration. Your saved brand style helps guide it. Choose a shape, generate, then click **Use this background** after reviewing the picture.

**ChatGPT native** uses your connected ChatGPT account when image generation is available. **Higgsfield** works with either ChatGPT or Claude: open **Settings → Image generation → Connect Higgsfield**, finish signing in in your browser, then return and press **Check connection**. Choose a Higgsfield image model and review the credit cost before generating. Connecting Higgsfield here is separate from connecting it in another app; no API key is needed.

You can set your preferred image provider in Settings, or change it for a single picture. Claude needs the Higgsfield connection to generate images. If you stop waiting after a generation starts, it may still finish in the provider's library; check there before trying again.

### When it says “Codex not found”

Content Chef needs the Codex connection installed on this computer. Signing in to the ChatGPT website alone does not install it.

For Windows, this is a one-time setup:

1. Open the [Node.js website](https://nodejs.org/) and download its Windows **LTS** installer. Node.js is a helper program needed for this installation.
2. Open the downloaded installer and follow its steps with the standard choices.
3. Open the Windows **Start** menu, type **PowerShell**, and open **Windows PowerShell**. This opens a window where you can paste a command.
4. Copy the whole line below, paste it into that window and press **Enter**:

   ```text
   npm.cmd install -g @openai/codex
   ```

5. Wait until it finishes and you can type again. If it reports an error, keep that message so someone can help; don’t keep retrying it.
6. Close and reopen Content Chef. Return to **Settings → AI assistant**, choose your ChatGPT connection and click **Check again**, then **Sign in with ChatGPT**.

For other computers or installation errors, use the [official Codex installation guide](https://developers.openai.com/codex/cli). If this step feels unfamiliar, ask the person who installed Content Chef to do it with you. After setup, everyday use happens inside the app.

## 3. Make your brand from your website

A **brand kit** is your business’s name, colours, fonts and writing style. Content Chef can suggest these from your website, and you can change them whenever you like.

1. Click the current brand name near the top left, then **New brand…**. The example brands are just there to try.
2. Choose **From my website**.
3. In **Your website**, type your website address, such as `yourbusiness.com`.
4. In **What should your brand feel like, and who is it for?**, explain the style you want, what you sell and who should see it. For example:

   > Promote my photography services to local business owners. Make the brand feel friendly, modern and professional.

5. Click **Build my brand**. Leave the window open while your connected assistant studies website screenshots and develops a brand direction. This can take a few minutes.
6. Review the creative direction, colours, fonts, imagery advice and wording. Expand **What we found & suggested** to see the website screenshots it used. Choose a logo if one was found, or keep your business name as text.
7. Click **Create brand & fine-tune**. Your brand is saved. You can revisit it under **Brand kit** later.

Website screenshots, page content and your description are sent to your selected AI to make these suggestions. Check that they describe your business correctly. The result is a new brand system inspired by the website, rather than an exact copy of its page design.

**No website, or the site couldn’t be read?** Choose **Start manually**, type your brand name and click **Create brand**. Choose colours and fonts in **Brand kit**, or connect your assistant and ask it to help you develop a look.

## 4. Ask for one ad

Click **Ask ChatGPT** (or **Ask Claude**) at the top of the studio. Click in the message box, type or paste the example below, and press **Enter**:

> Make one Instagram feed ad for my brand, promoting our services to local business owners. Use a friendly headline and a “Learn more” button. Show it in the editor so I can review it.

Replace “our services” with what you sell and “local business owners” with the people you want to reach. Wait for the assistant to finish; your design will appear in the editor.

You can keep talking to it:

- “Make the headline shorter.”
- “Use a lighter background.”
- “Change the offer to a free consultation.”

Check the wording, prices and contact details before using the ad. Prefer to make it yourself? Click **Create**, work through **Words**, **Look** and **Sizes**, and leave **Motion** for another time.

## 5. Save the picture and use it

**Export** means turning your design into a picture or video file you can use elsewhere.

1. In **Create**, find the **Export** panel. Scroll down if needed.
2. Choose **PNG (best)** for a still picture, then click the **Export** button. The button shows how many files it will make.
3. Wait until the progress window says **Served!** The first export may take longer while the app sets up what it needs.
4. Click **Open folder** to see the finished pictures on your computer.
5. Open your social media account, start a new post and select the picture from that folder. Content Chef does not post it automatically or buy advertising for you.

To keep a design to work on later, click **Save for later** in the Export panel, give it a campaign name (a folder-like label for related ads), then click **Save**. Find it under **Saved & exports**. You can also reopen a recent export from the **Dashboard** using **Edit in builder**.

## Make a swipe-through carousel

1. Click **Carousel** at the top of the studio.
2. Describe the story or advice you want to share. Choose **2–20 slides**; this total includes the opening slide and final call to action.
3. Enter the final action, such as **Book your shoot**, and click **Build carousel**.
4. Click any numbered slide to edit its words or appearance. To ask AI for a change, type under **Refine just this slide**, then click **Rewrite slide**. Check the preview and choose **Apply suggestion** or **Discard**.
5. Click **Save slide** to keep your edits. Moving to another slide also saves your changes. Your carousels are available in the **Saved carousels** dropdown on this page.
6. Click **Export all slides**. Open the folder or download the pictures, then upload `slide-01.png`, `slide-02.png` and the rest in that order when creating your social post.

## Next time you open Content Chef

Open the launcher and click **Open studio**. Choose your brand and ask for your next ad. You don’t need to repeat brand setup or sign in again unless the connection asks you to.

Installed Windows and Linux AppImage versions check for published updates automatically. When **Restart to update** appears, save your work, close the studio and click that button in the launcher. On a Mac, automatic updates require a signed release; check the downloads page if your installation cannot update.

## If you get stuck

| What you see | What to do |
|---|---|
| “Codex not found” | Follow the one-time setup above. |
| Sign-in finished, but it still looks disconnected | Return to **Settings → AI assistant** and click **Check again**. |
| Only “Create your first brand” is visible | Click **New brand → Start manually**, make a brand with your business name, then connect your assistant in **Settings**. You can return to website setup afterward. |
| “Build my brand” cannot be clicked | Enter a website address and connect your assistant first. |
| The website scan fails | Check the address opens in your browser. Try its public home page, or use **Start manually**. |
| You cannot find your pictures | Click **Open folder** after exporting. Installed apps normally keep work in **Documents → Content Chef → output**. |
| “No published update is available yet” | You can still use **Open studio**. This means no downloadable update has been published. |
| The assistant reports a usage limit | Wait until your account allows more use, or continue editing manually. Reinstalling the app won’t reset your account’s limit. |

For other problems, send the exact message and what you clicked to the person helping you, or [report a problem on GitHub](https://github.com/devyo1/ContentChef/issues). Leave passwords and sign-in codes out of your report.
