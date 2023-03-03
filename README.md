
### Noisepoint
Pex Mahoney Tufvesson

These files are for creating powerpoint-like presentations using a text editor.
The main reason for doing this is that it enables you to freely mix:

Text, images, videos, webcams, external cameras, audio, 3d-models, WebGL shaders, animated charts, javascript, etc.

...and you can use any text-based tools like git for collaborating and version control.


### Where do I run this?
It's not a program. It's not an app. It's a webpage, and you'll do changes to the sourcecode of that webpage.
Copy the file "template.html" to a new filename like "230302_presentation.html".
You view that file locally in Chrome. You make changes to the file. You reload the webpage in Chrome. Iterate.


### What skills do I need to use this?
Sorted from most important to least important:
* textfile editing
* generating a self-signed certificate and installing http-server as described in this README file

--- everything above this line is enough to create presentation using Noisepoint
* running OBS studio

--- if you want to record or stream your presentation
* Proper clothing and a solid coloured background wall

--- now you can show yourself together with your material as well
* a $30 lavalier microphone

--- now your online viewers can hear you properly
* $150 Video light setup

--- if you'd like to get a better quality video
* DLSR

--- if you'd like to get an even better quality video
* HTML/CSS

--- if you'd like to personalize the static look of the presentation
* Javascript coding

--- if you'd like to personalize the movements, fading, graphs or 
* WebGL shader coding
* 3d asset creation in Blender
* cables.gl effect creation

--- if you want to spice up the animations and 3d effects


### Serve your page using local https
To prevent browser fingerprinting, Chrome doesn't allow enumerating cameras or audio inputs unless on a "secure" https connection.
So, you will need to feed Chrome with a https webpage, which cannot be done by opening the file directly in Chrome.
More info here: https://web.dev/how-to-use-local-https/

The description below is for usage with MacOS. Something very similar will work under Linux versions as well.
For this, I use Homebrew on macos: https://brew.sh
This is a linux packet manager software running in userland. With brew, I install http-server:

    brew install http-server

Add a single row into your /etc/hosts file:

    127.0.0.1 local.noisepoint.se

You'll need to create your own signed certificate:

    brew install mkcert
    mkcert -install
    mkcert local.noisepoint.se

Go into the /noisepoint folder, and start serving the files:

    cd noisepoint
    http-server -p 8580 -S -C /Users/pex/phd/js/cert/local.noisepoint.se.pem -K /Users/pex/phd/js/cert/local.noisepoint.se-key.pem

Now open this URL in Chrome:

    https://local.noisepoint.se:8580/


### Streaming your presentation webpage to an online audience
For this, I use Open Broadcaster Software "OBS studio". https://obsproject.com

Through OBS, the "virtual webcam" can stream your presentation to Zoom/Microsoft Teams or similar.


These software modules are used:

### ThreeJS https://threejs.org
For realtime visualization of 3d-stuff in a browser.
You could of course use vanilla WebGL, but threejs contains lots of nice helper functions to make the math easier.

### Blender https://blender.org
Edit your 3d models in Blender. Free and open source: 
Kind of difficult to learn, since it's a full-blown 3d movie/nle video authoring tool.
Export in GLTF file format. Keep it uncompressed. Save textures separately.

### Chart.js https://chartjs.org
For animated drawing of bar charts, pie charts, etc. 

### Audio https://reaper.fm
I use Reaper to edit audio. Kind of difficult to learn, since it's a full-blown music production system. But it's worth it!

### mathjs https://mathjs.org

### snap svg https://snapsvg.io

### fonts
There are some fonts included that you can use. I will find their license files soon.


Hardware like this will make your presentation nicer:

### Teleprompter
With the OBS software, I composite the private notes on top of my presentation, and show that on my teleprompter https://en.wikipedia.org/wiki/Teleprompter

I built one myself using an old 24" monitor, black foamboard, and a teleprompter glass that's 30% reflective, 70% transmissive.

I ordered mine here: https://tele-prompter.de/teleprompter_glass   - I used the 500 * 400mm version.

Foamboard: https://panduro.com/sv-se/produkter/papper-stamplar/baspapper/kartong/cellplastkartong-a3-svart-434707

### Microphone
Boya BY-M1 Lavalier microphone:
https://www.kjell.com/se/produkter/ljud-bild/pa-ljud-underhallning/mikrofoner-tillbehor/slipsmikrofoner/boya-by-m1-mygga-for-mobilen-eller-kameran-p20025

### DSLR
I use a Panasonic Lumix GH5, with a 12-60mm four thirds lens, 2.8-4.0 aperture.

### Getting DLSR camera video into your laptop
https://www.elgato.com/sv/cam-link-4k
All DLSR-to-laptop-solutions that I've tested coming from the camera manufacturer doesn't work reliably (Stuttering, frame drops, etc).
Use the HDMI output of the camera, and use a dedicated adapter for HDMI to USB 3.0 or USB-C.

### External webcam
I would recommend something like Elgato Facecam 1080p60. No microphone.

### External cam by using an external iOS device with a MacOS laptop
Use "Camo" fro iOS app store if you have an USB-C cable to connect it, or
"EpocCam" from iOS app store if you want to connect them using local wifi.


### License?
Noisepoint is released using this MIT license:
MIT License

Copyright (c) 2023 Pex Tufvesson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


### Anything else?
Nope. Have a noise night! / Pex
