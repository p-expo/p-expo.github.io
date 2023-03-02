"use strict";

var CABLES=CABLES||{};
CABLES.OPS=CABLES.OPS||{};

var Ops=Ops || {};
Ops.Gl=Ops.Gl || {};
Ops.Ui=Ops.Ui || {};
Ops.Anim=Ops.Anim || {};
Ops.Html=Ops.Html || {};
Ops.Math=Ops.Math || {};
Ops.Time=Ops.Time || {};
Ops.Vars=Ops.Vars || {};
Ops.Array=Ops.Array || {};
Ops.Color=Ops.Color || {};
Ops.Patch=Ops.Patch || {};
Ops.Value=Ops.Value || {};
Ops.String=Ops.String || {};
Ops.Devices=Ops.Devices || {};
Ops.Sidebar=Ops.Sidebar || {};
Ops.Trigger=Ops.Trigger || {};
Ops.Gl.Matrix=Ops.Gl.Matrix || {};
Ops.Gl.Meshes=Ops.Gl.Meshes || {};
Ops.Gl.Shader=Ops.Gl.Shader || {};
Ops.Gl.Textures=Ops.Gl.Textures || {};
Ops.Devices.Mouse=Ops.Devices.Mouse || {};
Ops.Gl.TextureEffects=Ops.Gl.TextureEffects || {};
Ops.Gl.TextureEffects.Noise=Ops.Gl.TextureEffects.Noise || {};



// **************************************************************
// 
// Ops.Gl.Meshes.TextMesh_v2
// 
// **************************************************************

Ops.Gl.Meshes.TextMesh_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"textmesh_frag":"UNI sampler2D tex;\n#ifdef DO_MULTEX\n    UNI sampler2D texMul;\n#endif\n#ifdef DO_MULTEX_MASK\n    UNI sampler2D texMulMask;\n#endif\nIN vec2 texCoord;\nIN vec2 texPos;\nUNI float r;\nUNI float g;\nUNI float b;\nUNI float a;\n\nvoid main()\n{\n    vec4 col=texture(tex,texCoord);\n    col.a=col.r;\n    col.r*=r;\n    col.g*=g;\n    col.b*=b;\n    col*=a;\n\n    if(col.a==0.0)discard;\n\n    #ifdef DO_MULTEX\n        col*=texture(texMul,texPos);\n    #endif\n\n    #ifdef DO_MULTEX_MASK\n        col*=texture(texMulMask,texPos).r;\n    #endif\n\n    outColor=col;\n}","textmesh_vert":"UNI sampler2D tex;\nUNI mat4 projMatrix;\nUNI mat4 modelMatrix;\nUNI mat4 viewMatrix;\nUNI float scale;\nIN vec3 vPosition;\nIN vec2 attrTexCoord;\nIN mat4 instMat;\nIN vec2 attrTexOffsets;\nIN vec2 attrTexSize;\nIN vec2 attrTexPos;\nOUT vec2 texPos;\n\nOUT vec2 texCoord;\n\nvoid main()\n{\n    texCoord=(attrTexCoord*(attrTexSize)) + attrTexOffsets;\n    mat4 instMVMat=instMat;\n    instMVMat[3][0]*=scale;\n\n    texPos=attrTexPos;\n\n    vec4 vert=vec4( vPosition.x*(attrTexSize.x/attrTexSize.y)*scale,vPosition.y*scale,vPosition.z*scale, 1. );\n\n    mat4 mvMatrix=viewMatrix * modelMatrix * instMVMat;\n\n    gl_Position = projMatrix * mvMatrix * vert;\n}\n",};
const
    render = op.inTrigger("Render"),
    str = op.inString("Text", "cables"),
    scale = op.inValueFloat("Scale", 1),
    inFont = op.inString("Font", "Arial"),
    align = op.inValueSelect("align", ["left", "center", "right"], "center"),
    valign = op.inValueSelect("vertical align", ["Top", "Middle", "Bottom"], "Middle"),
    lineHeight = op.inValueFloat("Line Height", 1),
    letterSpace = op.inValueFloat("Letter Spacing"),

    tfilter = op.inSwitch("filter", ["nearest", "linear", "mipmap"], "mipmap"),
    aniso = op.inSwitch("Anisotropic", [0, 1, 2, 4, 8, 16], 0),

    inMulTex = op.inTexture("Texture Color"),
    inMulTexMask = op.inTexture("Texture Mask"),
    next = op.outTrigger("Next"),
    textureOut = op.outTexture("texture"),
    outLines = op.outNumber("Total Lines", 0),
    outWidth = op.outNumber("Width", 0),
    loaded = op.outBoolNum("Font Available", 0);

const cgl = op.patch.cgl;

op.setPortGroup("Masking", [inMulTex, inMulTexMask]);

const textureSize = 1024;
let fontLoaded = false;
let needUpdate = true;

align.onChange =
    str.onChange =
    lineHeight.onChange = generateMeshLater;

function generateMeshLater()
{
    needUpdate = true;
}

let canvasid = null;
CABLES.OpTextureMeshCanvas = {};
let valignMode = 0;

const geom = null;
let mesh = null;

let createMesh = true;
let createTexture = true;

aniso.onChange =
tfilter.onChange = () =>
{
    getFont().texture = null;
    createTexture = true;
};

inMulTexMask.onChange =
inMulTex.onChange = function ()
{
    shader.toggleDefine("DO_MULTEX", inMulTex.get());
    shader.toggleDefine("DO_MULTEX_MASK", inMulTexMask.get());
};

textureOut.set(null);
inFont.onChange = function ()
{
    createTexture = true;
    createMesh = true;
    checkFont();
};

op.patch.on("fontLoaded", (fontName) =>
{
    if (fontName == inFont.get())
    {
        createTexture = true;
        createMesh = true;
    }
});

function checkFont()
{
    const oldFontLoaded = fontLoaded;
    try
    {
        fontLoaded = document.fonts.check("20px \"" + inFont.get() + "\"");
    }
    catch (ex)
    {
        op.logError(ex);
    }

    if (!oldFontLoaded && fontLoaded)
    {
        loaded.set(true);
        createTexture = true;
        createMesh = true;
    }

    if (!fontLoaded) setTimeout(checkFont, 250);
}

valign.onChange = function ()
{
    if (valign.get() == "Middle")valignMode = 0;
    else if (valign.get() == "Top")valignMode = 1;
    else if (valign.get() == "Bottom")valignMode = 2;
};

function getFont()
{
    canvasid = "" + inFont.get();
    if (CABLES.OpTextureMeshCanvas.hasOwnProperty(canvasid))
        return CABLES.OpTextureMeshCanvas[canvasid];

    const fontImage = document.createElement("canvas");
    fontImage.dataset.font = inFont.get();
    fontImage.id = "texturetext_" + CABLES.generateUUID();
    fontImage.style.display = "none";
    const body = document.getElementsByTagName("body")[0];
    body.appendChild(fontImage);
    const _ctx = fontImage.getContext("2d");
    CABLES.OpTextureMeshCanvas[canvasid] =
        {
            "ctx": _ctx,
            "canvas": fontImage,
            "chars": {},
            "characters": "",
            "fontSize": 320
        };
    return CABLES.OpTextureMeshCanvas[canvasid];
}

op.onDelete = function ()
{
    if (canvasid && CABLES.OpTextureMeshCanvas[canvasid])
        CABLES.OpTextureMeshCanvas[canvasid].canvas.remove();
};

const shader = new CGL.Shader(cgl, "TextMesh");
shader.setSource(attachments.textmesh_vert, attachments.textmesh_frag);
const uniTex = new CGL.Uniform(shader, "t", "tex", 0);
const uniTexMul = new CGL.Uniform(shader, "t", "texMul", 1);
const uniTexMulMask = new CGL.Uniform(shader, "t", "texMulMask", 2);
const uniScale = new CGL.Uniform(shader, "f", "scale", scale);

const
    r = op.inValueSlider("r", 1),
    g = op.inValueSlider("g", 1),
    b = op.inValueSlider("b", 1),
    a = op.inValueSlider("a", 1),
    runiform = new CGL.Uniform(shader, "f", "r", r),
    guniform = new CGL.Uniform(shader, "f", "g", g),
    buniform = new CGL.Uniform(shader, "f", "b", b),
    auniform = new CGL.Uniform(shader, "f", "a", a);
r.setUiAttribs({ "colorPick": true });

op.setPortGroup("Display", [scale, inFont]);
op.setPortGroup("Alignment", [align, valign]);
op.setPortGroup("Color", [r, g, b, a]);

let height = 0;
const vec = vec3.create();
let lastTextureChange = -1;
let disabled = false;

render.onTriggered = function ()
{
    if (needUpdate)
    {
        generateMesh();
        needUpdate = false;
    }
    const font = getFont();
    if (font.lastChange != lastTextureChange)
    {
        createMesh = true;
        lastTextureChange = font.lastChange;
    }

    if (createTexture) generateTexture();
    if (createMesh)generateMesh();

    if (mesh && mesh.numInstances > 0)
    {
        cgl.pushBlendMode(CGL.BLEND_NORMAL, true);
        cgl.pushShader(shader);
        cgl.setTexture(0, textureOut.get().tex);

        const mulTex = inMulTex.get();
        if (mulTex)cgl.setTexture(1, mulTex.tex);

        const mulTexMask = inMulTexMask.get();
        if (mulTexMask)cgl.setTexture(2, mulTexMask.tex);

        if (valignMode === 2) vec3.set(vec, 0, height, 0);
        else if (valignMode === 1) vec3.set(vec, 0, 0, 0);
        else if (valignMode === 0) vec3.set(vec, 0, height / 2, 0);

        vec[1] -= lineHeight.get();
        cgl.pushModelMatrix();
        mat4.translate(cgl.mMatrix, cgl.mMatrix, vec);
        if (!disabled)mesh.render(cgl.getShader());

        cgl.popModelMatrix();

        cgl.setTexture(0, null);
        cgl.popShader();
        cgl.popBlendMode();
    }

    next.trigger();
};

letterSpace.onChange = function ()
{
    createMesh = true;
};

function generateMesh()
{
    const theString = String(str.get() + "");
    if (!textureOut.get()) return;

    const font = getFont();
    if (!font.geom)
    {
        font.geom = new CGL.Geometry("textmesh");

        font.geom.vertices = [
            1.0, 1.0, 0.0,
            0.0, 1.0, 0.0,
            1.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        ];

        font.geom.texCoords = new Float32Array([
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0
        ]);

        font.geom.verticesIndices = [
            0, 1, 2,
            2, 1, 3
        ];
    }

    if (!mesh)mesh = new CGL.Mesh(cgl, font.geom);

    const strings = (theString).split("\n");
    outLines.set(strings.length);

    const transformations = [];
    const tcOffsets = [];// new Float32Array(str.get().length*2);
    const tcSize = [];// new Float32Array(str.get().length*2);
    const texPos = [];
    let charCounter = 0;
    createTexture = false;
    const m = mat4.create();

    let maxWidth = 0;

    for (let s = 0; s < strings.length; s++)
    {
        const txt = strings[s];
        const numChars = txt.length;

        let pos = 0;
        let offX = 0;
        let width = 0;

        for (let i = 0; i < numChars; i++)
        {
            const chStr = txt.substring(i, i + 1);
            const char = font.chars[String(chStr)];
            if (char)
            {
                width += (char.texCoordWidth / char.texCoordHeight);
                width += letterSpace.get();
            }
        }

        width -= letterSpace.get();

        height = 0;

        if (align.get() == "left") offX = 0;
        else if (align.get() == "right") offX = width;
        else if (align.get() == "center") offX = width / 2;

        height = (s + 1) * lineHeight.get();

        for (let i = 0; i < numChars; i++)
        {
            const chStr = txt.substring(i, i + 1);
            const char = font.chars[String(chStr)];

            if (!char)
            {
                createTexture = true;
                return;
            }
            else
            {
                texPos.push(pos / width * 0.99 + 0.005, (1.0 - (s / (strings.length - 1))) * 0.99 + 0.005);
                tcOffsets.push(char.texCoordX, 1 - char.texCoordY - char.texCoordHeight);
                tcSize.push(char.texCoordWidth, char.texCoordHeight);

                mat4.identity(m);
                mat4.translate(m, m, [pos - offX, 0 - s * lineHeight.get(), 0]);

                pos += (char.texCoordWidth / char.texCoordHeight) + letterSpace.get();
                maxWidth = Math.max(maxWidth, pos - offX);

                transformations.push(Array.prototype.slice.call(m));

                charCounter++;
            }
        }
    }

    const transMats = [].concat.apply([], transformations);

    disabled = false;
    if (transMats.length == 0)disabled = true;

    mesh.numInstances = transMats.length / 16;

    if (mesh.numInstances == 0)
    {
        disabled = true;
        return;
    }

    outWidth.set(maxWidth * scale.get());
    mesh.setAttribute("instMat", new Float32Array(transMats), 16, { "instanced": true });
    mesh.setAttribute("attrTexOffsets", new Float32Array(tcOffsets), 2, { "instanced": true });
    mesh.setAttribute("attrTexSize", new Float32Array(tcSize), 2, { "instanced": true });
    mesh.setAttribute("attrTexPos", new Float32Array(texPos), 2, { "instanced": true });

    createMesh = false;

    if (createTexture) generateTexture();
}

function printChars(fontSize, simulate)
{
    const font = getFont();
    if (!simulate) font.chars = {};

    const ctx = font.ctx;

    ctx.font = fontSize + "px " + inFont.get();
    ctx.textAlign = "left";

    let posy = 0;
    let posx = 0;
    const lineHeight = fontSize * 1.4;
    const result =
        {
            "fits": true
        };

    for (let i = 0; i < font.characters.length; i++)
    {
        const chStr = String(font.characters.substring(i, i + 1));
        const chWidth = (ctx.measureText(chStr).width);

        if (posx + chWidth >= textureSize)
        {
            posy += lineHeight + 2;
            posx = 0;
        }

        if (!simulate)
        {
            font.chars[chStr] =
                {
                    "str": chStr,
                    "texCoordX": posx / textureSize,
                    "texCoordY": posy / textureSize,
                    "texCoordWidth": chWidth / textureSize,
                    "texCoordHeight": lineHeight / textureSize,
                };

            ctx.fillText(chStr, posx, posy + fontSize);
        }

        posx += chWidth + 12;
    }

    if (posy > textureSize - lineHeight)
    {
        result.fits = false;
    }

    result.spaceLeft = textureSize - posy;

    return result;
}

function generateTexture()
{
    let filter = CGL.Texture.FILTER_LINEAR;
    if (tfilter.get() == "nearest") filter = CGL.Texture.FILTER_NEAREST;
    if (tfilter.get() == "mipmap") filter = CGL.Texture.FILTER_MIPMAP;

    const font = getFont();
    let string = String(str.get());
    if (string == null || string == undefined)string = "";
    for (let i = 0; i < string.length; i++)
    {
        const ch = string.substring(i, i + 1);
        if (font.characters.indexOf(ch) == -1)
        {
            font.characters += ch;
            createTexture = true;
        }
    }

    const ctx = font.ctx;
    font.canvas.width = font.canvas.height = textureSize;

    if (!font.texture)
        font.texture = CGL.Texture.createFromImage(cgl, font.canvas,
            {
                "filter": filter,
                "anisotropic": parseFloat(aniso.get())
            });

    font.texture.setSize(textureSize, textureSize);

    ctx.fillStyle = "transparent";
    ctx.clearRect(0, 0, textureSize, textureSize);
    ctx.fillStyle = "rgba(255,255,255,255)";

    let fontSize = font.fontSize + 40;
    let simu = printChars(fontSize, true);

    while (!simu.fits)
    {
        fontSize -= 5;
        simu = printChars(fontSize, true);
    }

    printChars(fontSize, false);

    ctx.restore();

    font.texture.initTexture(font.canvas, filter);
    font.texture.unpackAlpha = true;
    textureOut.set(font.texture);

    font.lastChange = CABLES.now();

    createMesh = true;
    createTexture = false;
}


};

Ops.Gl.Meshes.TextMesh_v2.prototype = new CABLES.Op();
CABLES.OPS["2390f6b3-2122-412e-8c8d-5c2f574e8bd1"]={f:Ops.Gl.Meshes.TextMesh_v2,objName:"Ops.Gl.Meshes.TextMesh_v2"};




// **************************************************************
// 
// Ops.Gl.MainLoop
// 
// **************************************************************

Ops.Gl.MainLoop = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    fpsLimit = op.inValue("FPS Limit", 0),
    trigger = op.outTrigger("trigger"),
    width = op.outNumber("width"),
    height = op.outNumber("height"),
    reduceFocusFPS = op.inValueBool("Reduce FPS not focussed", true),
    reduceLoadingFPS = op.inValueBool("Reduce FPS loading"),
    clear = op.inValueBool("Clear", true),
    clearAlpha = op.inValueBool("ClearAlpha", true),
    fullscreen = op.inValueBool("Fullscreen Button", false),
    active = op.inValueBool("Active", true),
    hdpi = op.inValueBool("Hires Displays", false),
    inUnit = op.inSwitch("Pixel Unit", ["Display", "CSS"], "Display");

op.onAnimFrame = render;
hdpi.onChange = function ()
{
    if (hdpi.get()) op.patch.cgl.pixelDensity = window.devicePixelRatio;
    else op.patch.cgl.pixelDensity = 1;

    op.patch.cgl.updateSize();
    if (CABLES.UI) gui.setLayout();

    // inUnit.setUiAttribs({ "greyout": !hdpi.get() });

    // if (!hdpi.get())inUnit.set("CSS");
    // else inUnit.set("Display");
};

active.onChange = function ()
{
    op.patch.removeOnAnimFrame(op);

    if (active.get())
    {
        op.setUiAttrib({ "extendTitle": "" });
        op.onAnimFrame = render;
        op.patch.addOnAnimFrame(op);
        op.log("adding again!");
    }
    else
    {
        op.setUiAttrib({ "extendTitle": "Inactive" });
    }
};

const cgl = op.patch.cgl;
let rframes = 0;
let rframeStart = 0;

if (!op.patch.cgl) op.uiAttr({ "error": "No webgl cgl context" });

const identTranslate = vec3.create();
vec3.set(identTranslate, 0, 0, 0);
const identTranslateView = vec3.create();
vec3.set(identTranslateView, 0, 0, -2);

fullscreen.onChange = updateFullscreenButton;
setTimeout(updateFullscreenButton, 100);
let fsElement = null;

let winhasFocus = true;
let winVisible = true;

window.addEventListener("blur", () => { winhasFocus = false; });
window.addEventListener("focus", () => { winhasFocus = true; });
document.addEventListener("visibilitychange", () => { winVisible = !document.hidden; });
testMultiMainloop();

inUnit.onChange = () =>
{
    width.set(0);
    height.set(0);
};

function getFpsLimit()
{
    if (reduceLoadingFPS.get() && op.patch.loading.getProgress() < 1.0) return 5;

    if (reduceFocusFPS.get())
    {
        if (!winVisible) return 10;
        if (!winhasFocus) return 30;
    }

    return fpsLimit.get();
}

function updateFullscreenButton()
{
    function onMouseEnter()
    {
        if (fsElement)fsElement.style.display = "block";
    }

    function onMouseLeave()
    {
        if (fsElement)fsElement.style.display = "none";
    }

    op.patch.cgl.canvas.addEventListener("mouseleave", onMouseLeave);
    op.patch.cgl.canvas.addEventListener("mouseenter", onMouseEnter);

    if (fullscreen.get())
    {
        if (!fsElement)
        {
            fsElement = document.createElement("div");

            const container = op.patch.cgl.canvas.parentElement;
            if (container)container.appendChild(fsElement);

            fsElement.addEventListener("mouseenter", onMouseEnter);
            fsElement.addEventListener("click", function (e)
            {
                if (CABLES.UI && !e.shiftKey) gui.cycleFullscreen();
                else cgl.fullScreen();
            });
        }

        fsElement.style.padding = "10px";
        fsElement.style.position = "absolute";
        fsElement.style.right = "5px";
        fsElement.style.top = "5px";
        fsElement.style.width = "20px";
        fsElement.style.height = "20px";
        fsElement.style.cursor = "pointer";
        fsElement.style["border-radius"] = "40px";
        fsElement.style.background = "#444";
        fsElement.style["z-index"] = "9999";
        fsElement.style.display = "none";
        fsElement.innerHTML = "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" id=\"Capa_1\" x=\"0px\" y=\"0px\" viewBox=\"0 0 490 490\" style=\"width:20px;height:20px;\" xml:space=\"preserve\" width=\"512px\" height=\"512px\"><g><path d=\"M173.792,301.792L21.333,454.251v-80.917c0-5.891-4.776-10.667-10.667-10.667C4.776,362.667,0,367.442,0,373.333V480     c0,5.891,4.776,10.667,10.667,10.667h106.667c5.891,0,10.667-4.776,10.667-10.667s-4.776-10.667-10.667-10.667H36.416     l152.459-152.459c4.093-4.237,3.975-10.99-0.262-15.083C184.479,297.799,177.926,297.799,173.792,301.792z\" fill=\"#FFFFFF\"/><path d=\"M480,0H373.333c-5.891,0-10.667,4.776-10.667,10.667c0,5.891,4.776,10.667,10.667,10.667h80.917L301.792,173.792     c-4.237,4.093-4.354,10.845-0.262,15.083c4.093,4.237,10.845,4.354,15.083,0.262c0.089-0.086,0.176-0.173,0.262-0.262     L469.333,36.416v80.917c0,5.891,4.776,10.667,10.667,10.667s10.667-4.776,10.667-10.667V10.667C490.667,4.776,485.891,0,480,0z\" fill=\"#FFFFFF\"/><path d=\"M36.416,21.333h80.917c5.891,0,10.667-4.776,10.667-10.667C128,4.776,123.224,0,117.333,0H10.667     C4.776,0,0,4.776,0,10.667v106.667C0,123.224,4.776,128,10.667,128c5.891,0,10.667-4.776,10.667-10.667V36.416l152.459,152.459     c4.237,4.093,10.99,3.975,15.083-0.262c3.992-4.134,3.992-10.687,0-14.82L36.416,21.333z\" fill=\"#FFFFFF\"/><path d=\"M480,362.667c-5.891,0-10.667,4.776-10.667,10.667v80.917L316.875,301.792c-4.237-4.093-10.99-3.976-15.083,0.261     c-3.993,4.134-3.993,10.688,0,14.821l152.459,152.459h-80.917c-5.891,0-10.667,4.776-10.667,10.667s4.776,10.667,10.667,10.667     H480c5.891,0,10.667-4.776,10.667-10.667V373.333C490.667,367.442,485.891,362.667,480,362.667z\" fill=\"#FFFFFF\"/></g></svg>";
    }
    else
    {
        if (fsElement)
        {
            fsElement.style.display = "none";
            fsElement.remove();
            fsElement = null;
        }
    }
}

op.onDelete = function ()
{
    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);
};

function render(time)
{
    if (!active.get()) return;
    if (cgl.aborted || cgl.canvas.clientWidth === 0 || cgl.canvas.clientHeight === 0) return;

    op.patch.cg = cgl;

    const startTime = performance.now();

    op.patch.config.fpsLimit = getFpsLimit();

    if (cgl.canvasWidth == -1)
    {
        cgl.setCanvas(op.patch.config.glCanvasId);
        return;
    }

    if (cgl.canvasWidth != width.get() || cgl.canvasHeight != height.get())
    {
        let div = 1;
        if (inUnit.get() == "CSS")div = op.patch.cgl.pixelDensity;

        width.set(cgl.canvasWidth / div);
        height.set(cgl.canvasHeight / div);
    }

    if (CABLES.now() - rframeStart > 1000)
    {
        CGL.fpsReport = CGL.fpsReport || [];
        if (op.patch.loading.getProgress() >= 1.0 && rframeStart !== 0)CGL.fpsReport.push(rframes);
        rframes = 0;
        rframeStart = CABLES.now();
    }
    CGL.MESH.lastShader = null;
    CGL.MESH.lastMesh = null;

    cgl.renderStart(cgl, identTranslate, identTranslateView);

    if (clear.get())
    {
        cgl.gl.clearColor(0, 0, 0, 1);
        cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);
    }

    trigger.trigger();

    if (CGL.MESH.lastMesh)CGL.MESH.lastMesh.unBind();

    if (CGL.Texture.previewTexture)
    {
        if (!CGL.Texture.texturePreviewer) CGL.Texture.texturePreviewer = new CGL.Texture.texturePreview(cgl);
        CGL.Texture.texturePreviewer.render(CGL.Texture.previewTexture);
    }
    cgl.renderEnd(cgl);

    op.patch.cg = null;

    if (clearAlpha.get())
    {
        cgl.gl.clearColor(1, 1, 1, 1);
        cgl.gl.colorMask(false, false, false, true);
        cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT);
        cgl.gl.colorMask(true, true, true, true);
    }

    if (!cgl.frameStore.phong)cgl.frameStore.phong = {};
    rframes++;

    op.patch.cgl.profileData.profileMainloopMs = performance.now() - startTime;
}

function testMultiMainloop()
{
    setTimeout(
        () =>
        {
            if (op.patch.getOpsByObjName(op.name).length > 1)
            {
                op.setUiError("multimainloop", "there should only be one mainloop op!");
                op.patch.addEventListener("onOpDelete", testMultiMainloop);
            }
            else op.setUiError("multimainloop", null, 1);
        }, 500);
}


};

Ops.Gl.MainLoop.prototype = new CABLES.Op();
CABLES.OPS["b0472a1d-db16-4ba6-8787-f300fbdc77bb"]={f:Ops.Gl.MainLoop,objName:"Ops.Gl.MainLoop"};




// **************************************************************
// 
// Ops.Sequence
// 
// **************************************************************

Ops.Sequence = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    cleanup = op.inTriggerButton("Clean up connections");

const
    exes = [],
    triggers = [],
    num = 16;

let updateTimeout = null;

exe.onTriggered = triggerAll;
cleanup.onTriggered = clean;
cleanup.setUiAttribs({ "hidePort": true });
cleanup.setUiAttribs({ "hideParam": true });

for (let i = 0; i < num; i++)
{
    const p = op.outTrigger("trigger " + i);
    triggers.push(p);
    p.onLinkChanged = updateButton;

    if (i < num - 1)
    {
        let newExe = op.inTrigger("exe " + i);
        newExe.onTriggered = triggerAll;
        exes.push(newExe);
    }
}

function updateButton()
{
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(() =>
    {
        let show = false;
        for (let i = 0; i < triggers.length; i++)
            if (triggers[i].links.length > 1) show = true;

        cleanup.setUiAttribs({ "hideParam": !show });

        if (op.isCurrentUiOp()) op.refreshParams();
    }, 60);
}

function triggerAll()
{
    for (let i = 0; i < triggers.length; i++) triggers[i].trigger();
}

function clean()
{
    let count = 0;
    for (let i = 0; i < triggers.length; i++)
    {
        let removeLinks = [];

        if (triggers[i].links.length > 1)
            for (let j = 1; j < triggers[i].links.length; j++)
            {
                while (triggers[count].links.length > 0) count++;

                removeLinks.push(triggers[i].links[j]);
                const otherPort = triggers[i].links[j].getOtherPort(triggers[i]);
                op.patch.link(op, "trigger " + count, otherPort.parent, otherPort.name);
                count++;
            }

        for (let j = 0; j < removeLinks.length; j++) removeLinks[j].remove();
    }
    updateButton();
}


};

Ops.Sequence.prototype = new CABLES.Op();
CABLES.OPS["a466bc1f-06e9-4595-8849-bffb9fe22f99"]={f:Ops.Sequence,objName:"Ops.Sequence"};




// **************************************************************
// 
// Ops.Html.FontFile_v2
// 
// **************************************************************

Ops.Html.FontFile_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    filename = op.inUrl("file", [".otf", ".ttf", ".woff", ".woff2"]),
    fontname = op.inString("family"),
    outLoaded = op.outBoolNum("Loaded"),
    loadedTrigger = op.outTrigger("Loaded Trigger");

let loadingId = null;

filename.onChange = function ()
{
    outLoaded.set(false);
    addStyle();
};

fontname.onChange = addStyle;

let fontFaceObj;

function addStyle()
{
    if (filename.get() && fontname.get())
    {
        if (document.fonts)
        {
            fontFaceObj = new FontFace(fontname.get(), "url(" + op.patch.getFilePath(String(filename.get())) + ")");

            loadingId = op.patch.cgl.patch.loading.start("FontFile", filename.get());

            // Add the FontFace to the FontFaceSet
            document.fonts.add(fontFaceObj);

            // Get the current status of the FontFace
            // (should be 'unloaded')

            // Load the FontFace
            fontFaceObj.load();

            // Get the current status of the Fontface
            // (should be 'loading' or 'loaded' if cached)

            // Wait until the font has been loaded, log the current status.
            fontFaceObj.loaded.then((fontFace) =>
            {
                outLoaded.set(true);
                loadedTrigger.trigger();
                op.patch.cgl.patch.loading.finished(loadingId);

                op.patch.emitEvent("fontLoaded", fontname.get());

                // Throw an error if loading wasn't successful
            }, (fontFace) =>
            {
                op.setUiError("loadingerror", "Font loading error!" + fontFaceObj.status);
                // op.logError("Font loading error! Current status", fontFaceObj.status);
            });
        }
        else
        { // font loading api not supported
            const fileUrl = op.patch.getFilePath(String(filename.get()));
            const styleStr = ""
                .endl() + "@font-face"
                .endl() + "{"
                .endl() + "  font-family: \"" + fontname.get() + "\";"
                .endl() + "  src: url(\"" + fileUrl + "\") format(\"truetype\");"
                .endl() + "}";

            const style = document.createElement("style");
            style.type = "text/css";
            style.innerHTML = styleStr;
            document.getElementsByTagName("head")[document.getElementsByTagName("head").length - 1].appendChild(style);
            // TODO: Poll if font loaded
        }
    }
}


};

Ops.Html.FontFile_v2.prototype = new CABLES.Op();
CABLES.OPS["68177370-116e-4c76-aef3-3b10d68e7227"]={f:Ops.Html.FontFile_v2,objName:"Ops.Html.FontFile_v2"};




// **************************************************************
// 
// Ops.Gl.Textures.TextTexture_v4
// 
// **************************************************************

Ops.Gl.Textures.TextTexture_v4 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"text_frag":"UNI sampler2D tex;\nUNI float a;\nUNI vec3 color;\nIN vec2 texCoord;\n\nvec4 myround(vec4 col)\n{\n    if(col.a>0.5)return vec4(1.0,1.0,1.0,1.0);\n    else return vec4(1.0,1.0,1.0,0.0);\n}\n\nvoid main()\n{\n    vec4 col;\n\n    #ifndef HARD_EDGE\n        // col= vec4(1.0,1.0,1.0,texture(tex,vec2(texCoord.x,(1.0-texCoord.y))).r*a);\n        col = texture(tex,vec2(texCoord.x,(1.0-texCoord.y)));\n    #endif\n    #ifdef HARD_EDGE\n\n        float step=0.7;\n        col=texture(tex,vec2(texCoord.x,1.0-texCoord.y));\n        vec4 col2=texture(tex,vec2(texCoord.x-(fwidth(texCoord.x)*step),1.0-texCoord.y-(fwidth(texCoord.y)*step)));\n        vec4 col3=texture(tex,vec2(texCoord.x+(fwidth(texCoord.x)*step),1.0-texCoord.y+(fwidth(texCoord.y)*step)));\n        vec4 col4=texture(tex,vec2(texCoord.x+(fwidth(texCoord.x)*step),1.0-texCoord.y-(fwidth(texCoord.y)*step)));\n        vec4 col5=texture(tex,vec2(texCoord.x-(fwidth(texCoord.x)*step),1.0-texCoord.y+(fwidth(texCoord.y)*step)));\n\n        float f=smoothstep(col.a,0.5,0.8);\n\n        col=myround(col);\n        col2=myround(col2);\n        col3=myround(col3);\n        col4=myround(col4);\n        col5=myround(col5);\n\n        // col.a=(col.a+col2.a+col3.a+col4.a+col5.a)/5.0*a;\n\n    #endif\n\n    col.rgb=color.rgb;\n\n    outColor=col;\n\n}\n","text_vert":"{{MODULES_HEAD}}\n\nIN vec3 vPosition;\nUNI mat4 projMatrix;\nUNI mat4 mvMatrix;\nUNI float aspect;\nOUT vec2 texCoord;\nIN vec2 attrTexCoord;\n\nvoid main()\n{\n   vec4 pos=vec4(vPosition,  1.0);\n\n    pos.x*=aspect;\n\n   texCoord=vec2(attrTexCoord.x,1.0-attrTexCoord.y);;\n\n   gl_Position = projMatrix * mvMatrix * pos;\n}\n",};
function componentToHex(c)
{
    const hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b)
{
    return "#" + componentToHex(Math.floor(r * 255)) + componentToHex(Math.floor(g * 255)) + componentToHex(Math.floor(b * 255));
}

const
    render = op.inTriggerButton("Render"),
    text = op.inString("text", "cables"),
    font = op.inString("font", "Arial"),
    weight = op.inString("weight", "normal"),
    maximize = op.inValueBool("Maximize Size", true),
    inFontSize = op.inValueFloat("fontSize", 30),
    lineDistance = op.inValueFloat("Line Height", 1),
    lineOffset = op.inValueFloat("Vertical Offset", 0),
    // letterSpacing = op.inValueFloat("Spacing", 0),
    drawDebug = op.inBool("Show Debug", false),
    limitLines = op.inValueInt("Limit Lines", 0),
    texWidth = op.inValueInt("texture width", 512),
    texHeight = op.inValueInt("texture height", 128),
    tfilter = op.inSwitch("filter", ["nearest", "linear", "mipmap"], "linear"),
    wrap = op.inValueSelect("Wrap", ["repeat", "mirrored repeat", "clamp to edge"], "clamp to edge"),
    aniso = op.inSwitch("Anisotropic", [0, 1, 2, 4, 8, 16], 0),
    align = op.inSwitch("align", ["left", "center", "right"], "center"),
    valign = op.inSwitch("vertical align", ["top", "center", "bottom"], "center"),
    cachetexture = op.inValueBool("Reuse Texture", true),
    drawMesh = op.inValueBool("Draw Mesh", true),
    meshScale = op.inValueFloat("Scale Mesh", 1.0),
    renderHard = op.inValueBool("Hard Edges", false),
    inOpacity = op.inFloatSlider("Opacity", 1),
    r = op.inValueSlider("r", Math.random()),
    g = op.inValueSlider("g", Math.random()),
    b = op.inValueSlider("b", Math.random()),
    next = op.outTrigger("Next"),
    outRatio = op.outNumber("Ratio"),
    textureOut = op.outTexture("texture"),
    outAspect = op.outNumber("Aspect", 1),
    outLines = op.outNumber("Num Lines");

r.setUiAttribs({ "colorPick": true });

op.setPortGroup("Color", [r, g, b]);
op.setPortGroup("Size", [font, weight, maximize, inFontSize, lineDistance, lineOffset]);
op.setPortGroup("Texture", [texWidth, texHeight, tfilter, aniso]);
op.setPortGroup("Alignment", [valign, align]);
op.setPortGroup("Rendering", [drawMesh, renderHard, meshScale]);

align.onChange =
    valign.onChange =
    text.onChange =
    inFontSize.onChange =
    weight.onChange =
    aniso.onChange =
    font.onChange =
    lineOffset.onChange =
    lineDistance.onChange =
    cachetexture.onChange =
    // letterSpacing.onChange =
    limitLines.onChange =
    texWidth.onChange =
    texHeight.onChange =
    maximize.onChange = function () { needsRefresh = true; };

wrap.onChange = () =>
{
    if (tex)tex.delete();
    tex = null;
    needsRefresh = true;
};

r.onChange = g.onChange = b.onChange = inOpacity.onChange = function ()
{
    if (!drawMesh.get() || textureOut.isLinked())
        needsRefresh = true;
};
textureOut.onLinkChanged = () =>
{
    if (textureOut.isLinked()) needsRefresh = true;
};

op.patch.on("fontLoaded", (fontName) =>
{
    if (fontName == font.get())
    {
        needsRefresh = true;
    }
});

render.onTriggered = doRender;

aniso.onChange =
tfilter.onChange = () =>
{
    tex = null;
    needsRefresh = true;
};

textureOut.ignoreValueSerialize = true;

const cgl = op.patch.cgl;
const body = document.getElementsByTagName("body")[0];

let tex = new CGL.Texture(cgl);
const fontImage = document.createElement("canvas");
fontImage.id = "texturetext_" + CABLES.generateUUID();
fontImage.style.display = "none";
body.appendChild(fontImage);

const ctx = fontImage.getContext("2d");
let needsRefresh = true;
const mesh = CGL.MESHES.getSimpleRect(cgl, "texttexture rect");
const vScale = vec3.create();

const shader = new CGL.Shader(cgl, "texttexture");
shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
shader.setSource(attachments.text_vert, attachments.text_frag);
const texUni = new CGL.Uniform(shader, "t", "tex");
const aspectUni = new CGL.Uniform(shader, "f", "aspect", 0);
const opacityUni = new CGL.Uniform(shader, "f", "a", inOpacity);
const uniColor = new CGL.Uniform(shader, "3f", "color", r, g, b);
// const uniformColor = new CGL.Uniform(shader, "4f", "")

if (op.patch.isEditorMode()) CABLES.UI.SIMPLEWIREFRAMERECT = CABLES.UI.SIMPLEWIREFRAMERECT || new CGL.WireframeRect(cgl);

if (cgl.glVersion < 2)
{
    cgl.gl.getExtension("OES_standard_derivatives");
    shader.enableExtension("GL_OES_standard_derivatives");
}

renderHard.onChange = function ()
{
    shader.toggleDefine("HARD_EDGE", renderHard.get());
};

function doRender()
{
    if (ctx.canvas.width != texWidth.get())needsRefresh = true;
    if (needsRefresh)
    {
        reSize();
        refresh();
    }

    if (drawMesh.get())
    {
        vScale[0] = vScale[1] = vScale[2] = meshScale.get();
        cgl.pushBlendMode(CGL.BLEND_NORMAL, false);
        cgl.pushModelMatrix();
        mat4.scale(cgl.mMatrix, cgl.mMatrix, vScale);

        shader.popTextures();
        shader.pushTexture(texUni, tex.tex);
        aspectUni.set(outAspect.get());

        if (cgl.shouldDrawHelpers(op))
            CABLES.UI.SIMPLEWIREFRAMERECT.render(outAspect.get(), 1, 1);

        cgl.pushShader(shader);
        mesh.render(shader);

        cgl.popShader();
        cgl.popBlendMode();
        cgl.popModelMatrix();
    }

    next.trigger();
}

function reSize()
{
    if (!tex) return;
    tex.setSize(texWidth.get(), texHeight.get());

    ctx.canvas.width = fontImage.width = texWidth.get();
    ctx.canvas.height = fontImage.height = texHeight.get();

    outAspect.set(fontImage.width / fontImage.height);

    needsRefresh = true;
}

maximize.onChange = function ()
{
    inFontSize.setUiAttribs({ "greyout": maximize.get() });
    needsRefresh = true;
};

function getLineHeight(fontSize)
{
    return lineDistance.get() * fontSize;
}

function removeEmptyLines(lines)
{
    if (lines[lines.length - 1] === "" || lines[lines.length - 1] === "\n")
    {
        lines.length--;
        lines = removeEmptyLines(lines);
    }
    return lines;
}

function refresh()
{
    cgl.checkFrameStarted("texttrexture refresh");

    // const num=String(parseInt(letterSpacing.get()));
    //     fontImage.style["letter-spacing"] = num+"px";
    // fontImage.style["font-kerning"]="normal";

    ctx.clearRect(0, 0, fontImage.width, fontImage.height);
    const rgbString = "rgba(" + Math.floor(r.get() * 255) + ","
        + Math.floor(g.get() * 255) + "," + Math.floor(b.get() * 255) + ","
        + inOpacity.get() + ")";
    // ctx.fillStyle = "white";
    ctx.fillStyle = rgbString;
    // op.log("rgbstring", rgbString);
    let fontSize = parseFloat(inFontSize.get());
    let fontname = font.get();
    if (fontname.indexOf(" ") > -1) fontname = "\"" + fontname + "\"";
    ctx.font = weight.get() + " " + fontSize + "px " + fontname + "";
    // ctx["font-weight"] = 300;

    ctx.textAlign = align.get();

    let txt = (text.get() + "").replace(/<br\/>/g, "\n");
    let strings = txt.split("\n");

    needsRefresh = false;

    strings = removeEmptyLines(strings);

    if (maximize.get())
    {
        fontSize = texWidth.get();
        let count = 0;
        let maxWidth = 0;
        let maxHeight = 0;

        do
        {
            count++;
            if (count > (texHeight.get() + texWidth.get()) / 2)
            {
                op.log("too many iterations - maximize size");
                break;
            }
            fontSize -= 5;
            ctx.font = weight.get() + " " + fontSize + "px \"" + font.get() + "\"";
            maxWidth = 0;

            maxHeight = (fontSize + (strings.length - 1) * getLineHeight(fontSize)) * 1.2;
            for (let i = 0; i < strings.length; i++) maxWidth = Math.max(maxWidth, ctx.measureText(strings[i]).width);
        }
        while (maxWidth > ctx.canvas.width || maxHeight > ctx.canvas.height);
    }
    else
    {
        let found = true;

        if (texWidth.get() > 128)
        {
            found = false;
            let newString = "";

            for (let i = 0; i < strings.length; i++)
            {
                if (!strings[i])
                {
                    newString += "\n";
                    continue;
                }
                let sumWidth = 0;
                const words = strings[i].split(" ");

                for (let j = 0; j < words.length; j++)
                {
                    if (!words[j]) continue;
                    sumWidth += ctx.measureText(words[j] + " ").width;

                    if (sumWidth > texWidth.get())
                    {
                        found = true;
                        newString += "\n" + words[j] + " ";
                        sumWidth = ctx.measureText(words[j] + " ").width;
                    }
                    else
                    {
                        newString += words[j] + " ";
                    }
                }
                newString += "\n";
            }
            txt = newString;
            strings = txt.split("\n");
        }
        strings = removeEmptyLines(strings);

        if (limitLines.get() > 0 && strings.length > limitLines.get())
        {
            strings.length = limitLines.get();
            strings[strings.length - 1] += "...";
        }
    }

    strings = removeEmptyLines(strings);
    const firstLineHeight = fontSize;
    const textHeight = firstLineHeight + (strings.length - 1) * getLineHeight(fontSize);

    let posy = lineOffset.get() * fontSize;

    if (valign.get() == "top") posy += firstLineHeight;
    else if (valign.get() == "center") posy += (ctx.canvas.height / 2) - (textHeight / 2) + firstLineHeight;
    else if (valign.get() == "bottom") posy += ctx.canvas.height - textHeight + firstLineHeight;

    let miny = 999999;
    let maxy = -999999;

    const dbg = drawDebug.get();

    for (let i = 0; i < strings.length; i++)
    {
        let posx = 0;
        if (align.get() == "center") posx = ctx.canvas.width / 2;
        if (align.get() == "right") posx = ctx.canvas.width;

        ctx.fillText(strings[i], posx, posy);

        miny = Math.min(miny, posy - firstLineHeight);
        maxy = Math.max(maxy, posy);

        if (dbg)
        {
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#FF0000";
            ctx.beginPath();
            ctx.moveTo(0, posy);
            ctx.lineTo(21000, posy);
            ctx.stroke();
        }

        posy += getLineHeight(fontSize);
    }

    if (dbg)
    {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#FF0000";
        ctx.strokeRect(0, miny, ctx.canvas.width - 3, maxy - miny);
    }

    ctx.restore();

    outRatio.set(ctx.canvas.height / ctx.canvas.width);
    outLines.set(strings.length);
    textureOut.set(CGL.Texture.getEmptyTexture(cgl));

    let cgl_wrap = CGL.Texture.WRAP_REPEAT;
    if (wrap.get() == "mirrored repeat") cgl_wrap = CGL.Texture.WRAP_MIRRORED_REPEAT;
    if (wrap.get() == "clamp to edge") cgl_wrap = CGL.Texture.WRAP_CLAMP_TO_EDGE;

    let f = CGL.Texture.FILTER_LINEAR;
    if (tfilter.get() == "nearest") f = CGL.Texture.FILTER_NEAREST;
    else if (tfilter.get() == "mipmap") f = CGL.Texture.FILTER_MIPMAP;

    if (!cachetexture.get() || !tex || !textureOut.get() || tex.width != fontImage.width || tex.height != fontImage.height || tex.anisotropic != parseFloat(aniso.get()))
    {
        if (tex)tex.delete();
        tex = new CGL.Texture.createFromImage(cgl, fontImage, { "filter": f, "anisotropic": parseFloat(aniso.get()), "wrap": cgl_wrap });
    }

    tex.flip = false;
    tex.initTexture(fontImage, f);
    textureOut.set(tex);
    tex.unpackAlpha = true;
}


};

Ops.Gl.Textures.TextTexture_v4.prototype = new CABLES.Op();
CABLES.OPS["afab973f-c9ac-47fd-914c-70b42af5c5d4"]={f:Ops.Gl.Textures.TextTexture_v4,objName:"Ops.Gl.Textures.TextTexture_v4"};




// **************************************************************
// 
// Ops.Gl.Shader.PointMaterial_v4
// 
// **************************************************************

Ops.Gl.Shader.PointMaterial_v4 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"pointmat_frag":"\n{{MODULES_HEAD}}\n\nUNI vec4 color;\n// IN vec2 pointCoord;\nIN float ps;\n\n#ifdef HAS_TEXTURE_DIFFUSE\n    UNI sampler2D diffTex;\n#endif\n#ifdef HAS_TEXTURE_MASK\n    UNI sampler2D texMask;\n#endif\n#ifdef HAS_TEXTURE_COLORIZE\n    IN vec4 colorize;\n#endif\n#ifdef HAS_TEXTURE_OPACITY\n    IN float opacity;\n#endif\n#ifdef VERTEX_COLORS\n    IN vec4 vertexColor;\n#endif\n\nvoid main()\n{\n    #ifdef FLIP_TEX\n        vec2 pointCoord=vec2(gl_PointCoord.x,(1.0-gl_PointCoord.y));\n    #endif\n    #ifndef FLIP_TEX\n        vec2 pointCoord=gl_PointCoord;\n    #endif\n    {{MODULE_BEGIN_FRAG}}\n\n    if(ps<1.0)discard;\n\n    vec4 col=color;\n\n    #ifdef HAS_TEXTURE_MASK\n        float mask;\n        #ifdef TEXTURE_MASK_R\n            mask=texture(texMask,pointCoord).r;\n        #endif\n        #ifdef TEXTURE_MASK_A\n            mask=texture(texMask,pointCoord).a;\n        #endif\n        #ifdef TEXTURE_MASK_LUMI\n        \tvec3 lumcoeff = vec3(0.299,0.587,0.114);\n        \tmask = dot(texture(texMask,pointCoord).rgb, lumcoeff);\n        #endif\n\n    #endif\n\n    #ifdef HAS_TEXTURE_DIFFUSE\n        col=texture(diffTex,pointCoord);\n        #ifdef COLORIZE_TEXTURE\n          col.rgb*=color.rgb;\n        #endif\n    #endif\n    col.a*=color.a;\n\n    {{MODULE_COLOR}}\n\n    #ifdef MAKE_ROUND\n\n        #ifndef MAKE_ROUNDAA\n            if ((gl_PointCoord.x-0.5)*(gl_PointCoord.x-0.5) + (gl_PointCoord.y-0.5)*(gl_PointCoord.y-0.5) > 0.25) discard; //col.a=0.0;\n        #endif\n\n        #ifdef MAKE_ROUNDAA\n            float circ=(gl_PointCoord.x-0.5)*(gl_PointCoord.x-0.5) + (gl_PointCoord.y-0.5)*(gl_PointCoord.y-0.5);\n\n            float a=smoothstep(0.25,0.25-fwidth(gl_PointCoord.x),circ);\n            if(a==0.0)discard;\n            col.a=a*color.a;\n        #endif\n    #endif\n\n    #ifdef HAS_TEXTURE_COLORIZE\n        col*=colorize;\n    #endif\n\n    #ifdef TEXTURE_COLORIZE_MUL\n        col*=color;\n    #endif\n\n    #ifdef HAS_TEXTURE_MASK\n        col.a*=mask;\n    #endif\n\n    #ifdef HAS_TEXTURE_OPACITY\n        col.a*=opacity;\n    #endif\n\n    #ifdef VERTEX_COLORS\n        col.rgb = vertexColor.rgb;\n        col.a *= vertexColor.a;\n    #endif\n\n    if (col.a <= 0.0) discard;\n\n    #ifdef HAS_TEXTURE_COLORIZE\n        col*=colorize;\n    #endif\n\n    outColor = col;\n}\n","pointmat_vert":"{{MODULES_HEAD}}\nIN vec3 vPosition;\nIN vec2 attrTexCoord;\nIN vec3 attrVertNormal;\nIN vec3 attrTangent;\nIN vec3 attrBiTangent;\n\n#ifdef VERTEX_COLORS\n    IN vec4 attrVertColor;\n    OUT vec4 vertexColor;\n#endif\n\nOUT vec3 norm;\nOUT float ps;\n\nOUT vec2 texCoord;\n\n\n#ifdef HAS_TEXTURES\n#endif\n\n#ifdef HAS_TEXTURE_COLORIZE\n   UNI sampler2D texColorize;\n   OUT vec4 colorize;\n#endif\n#ifdef HAS_TEXTURE_OPACITY\n    UNI sampler2D texOpacity;\n    OUT float opacity;\n#endif\n\n#ifdef HAS_TEXTURE_POINTSIZE\n   UNI sampler2D texPointSize;\n   UNI float texPointSizeMul;\n#endif\n\nUNI mat4 projMatrix;\nUNI mat4 modelMatrix;\nUNI mat4 viewMatrix;\n\nUNI float pointSize;\nUNI vec3 camPos;\n\nUNI float canvasWidth;\nUNI float canvasHeight;\nUNI float camDistMul;\nUNI float randomSize;\n\nIN float attrVertIndex;\n\n\n\nfloat rand(float n){return fract(sin(n) * 5711.5711123);}\n\n#define POINTMATERIAL\n\nvoid main()\n{\n    norm=attrVertNormal;\n    #ifdef PIXELSIZE\n        float psMul=1.0;\n    #endif\n\n    #ifndef PIXELSIZE\n        float psMul=sqrt(canvasWidth/canvasHeight)+0.00000000001;\n    #endif\n\n    // float sizeMultiply=1.0;\n\n    vec3 tangent=attrTangent;\n    vec3 bitangent=attrBiTangent;\n\n\n    #ifdef VERTEX_COLORS\n        vertexColor=attrVertColor;\n    #endif\n\n    // #ifdef HAS_TEXTURES\n        texCoord=attrTexCoord;\n    // #endif\n\n    #ifdef HAS_TEXTURE_OPACITY\n        // opacity=texture(texOpacity,vec2(rand(attrVertIndex+texCoord.x*texCoord.y+texCoord.y+texCoord.x),rand(texCoord.y*texCoord.x-texCoord.x-texCoord.y-attrVertIndex))).r;\n        opacity=texture(texOpacity,texCoord).r;\n    #endif\n\n\n    #ifdef HAS_TEXTURE_COLORIZE\n        #ifdef RANDOM_COLORIZE\n            colorize=texture(texColorize,vec2(rand(attrVertIndex+texCoord.x*texCoord.y+texCoord.y+texCoord.x),rand(texCoord.y*texCoord.x-texCoord.x-texCoord.y-attrVertIndex)));\n        #endif\n        #ifndef RANDOM_COLORIZE\n            colorize=texture(texColorize,texCoord);\n        #endif\n    #endif\n\n\n\n\n\n    mat4 mMatrix=modelMatrix;\n    vec4 pos = vec4( vPosition, 1. );\n\n    gl_PointSize=0.0;\n\n    {{MODULE_VERTEX_POSITION}}\n\n    vec4 model=mMatrix * pos;\n\n    psMul+=rand(texCoord.x*texCoord.y+texCoord.y*3.0+texCoord.x*2.0+attrVertIndex)*randomSize;\n    // psMul*=sizeMultiply;\n\n    float addPointSize=0.0;\n    #ifdef HAS_TEXTURE_POINTSIZE\n\n        #ifdef POINTSIZE_CHAN_R\n            addPointSize=texture(texPointSize,texCoord).r;\n        #endif\n        #ifdef POINTSIZE_CHAN_G\n            addPointSize=texture(texPointSize,texCoord).g;\n        #endif\n        #ifdef POINTSIZE_CHAN_B\n            addPointSize=texture(texPointSize,texCoord).b;\n        #endif\n\n\n        #ifdef DOTSIZEREMAPABS\n            // addPointSize=(( (texture(texPointSize,texCoord).r) * texPointSizeMul)-0.5)*2.0;\n\n            addPointSize=1.0-(distance(addPointSize,0.5)*2.0);\n            // addPointSize=abs(1.0-(distance(addPointSize,0.5)*2.0));\n            addPointSize=addPointSize*addPointSize*addPointSize*2.0;\n\n            // addPointSize=(( (texture(texPointSize,texCoord).r) * texPointSizeMul)-0.5)*2.0;\n        #endif\n\n        addPointSize*=texPointSizeMul;\n\n    #endif\n\n    ps=0.0;\n    #ifndef SCALE_BY_DISTANCE\n        ps = (pointSize+addPointSize) * psMul;\n    #endif\n    #ifdef SCALE_BY_DISTANCE\n        float cameraDist = distance(model.xyz, camPos);\n        ps = ( (pointSize+addPointSize) / cameraDist) * psMul;\n    #endif\n\n    gl_PointSize += ps;\n\n\n    gl_Position = projMatrix * viewMatrix * model;\n}\n",};
const cgl = op.patch.cgl;

const
    render = op.inTrigger("render"),
    pointSize = op.inValueFloat("PointSize", 3),
    inPixelSize = op.inBool("Size in Pixels", false),
    randomSize = op.inValue("Random Size", 0),
    makeRound = op.inValueBool("Round", true),
    makeRoundAA = op.inValueBool("Round Antialias", false),
    doScale = op.inValueBool("Scale by Distance", false),
    r = op.inValueSlider("r", Math.random()),
    g = op.inValueSlider("g", Math.random()),
    b = op.inValueSlider("b", Math.random()),
    a = op.inValueSlider("a", 1),
    vertCols = op.inBool("Vertex Colors", false),
    texture = op.inTexture("texture"),
    textureMulColor = op.inBool("Colorize Texture"),
    textureMask = op.inTexture("Texture Mask"),
    texMaskChan = op.inSwitch("Mask Channel", ["R", "A", "Luminance"], "R"),
    textureColorize = op.inTexture("Texture Colorize"),
    colorizeRandom = op.inValueBool("Colorize Randomize", true),
    textureOpacity = op.inTexture("Texture Opacity"),
    texturePointSize = op.inTexture("Texture Point Size"),
    texturePointSizeChannel = op.inSwitch("Point Size Channel", ["R", "G", "B"], "R"),
    texturePointSizeMul = op.inFloat("Texture Point Size Mul", 1),
    texturePointSizeMap = op.inSwitch("Map Size 0", ["Black", "Grey"], "Black"),
    flipTex = op.inValueBool("Flip Texture", false),

    trigger = op.outTrigger("trigger"),
    shaderOut = op.outObject("shader", null, "shader");

op.setPortGroup("Texture", [texture, textureMulColor, textureMask, texMaskChan, textureColorize, textureOpacity, colorizeRandom]);
op.setPortGroup("Color", [r, g, b, a, vertCols]);
op.setPortGroup("Size", [pointSize, randomSize, makeRound, makeRoundAA, doScale, inPixelSize, texturePointSize, texturePointSizeMul, texturePointSizeChannel, texturePointSizeMap]);
r.setUiAttribs({ "colorPick": true });

const shader = new CGL.Shader(cgl, "PointMaterial");
shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
shader.define("MAKE_ROUND");

const
    uniPointSize = new CGL.Uniform(shader, "f", "pointSize", pointSize),
    texturePointSizeMulUniform = new CGL.Uniform(shader, "f", "texPointSizeMul", texturePointSizeMul),
    uniRandomSize = new CGL.Uniform(shader, "f", "randomSize", randomSize),
    uniColor = new CGL.Uniform(shader, "4f", "color", r, g, b, a),
    uniWidth = new CGL.Uniform(shader, "f", "canvasWidth", cgl.canvasWidth),
    uniHeight = new CGL.Uniform(shader, "f", "canvasHeight", cgl.canvasHeight),
    textureUniform = new CGL.Uniform(shader, "t", "diffTex"),
    textureColorizeUniform = new CGL.Uniform(shader, "t", "texColorize"),
    textureOpacityUniform = new CGL.Uniform(shader, "t", "texOpacity"),
    textureColoPointSize = new CGL.Uniform(shader, "t", "texPointSize"),
    texturePointSizeUniform = new CGL.Uniform(shader, "t", "texPointSize"),
    textureMaskUniform = new CGL.Uniform(shader, "t", "texMask");

shader.setSource(attachments.pointmat_vert, attachments.pointmat_frag);
shader.glPrimitive = cgl.gl.POINTS;
shaderOut.set(shader);
shaderOut.ignoreValueSerialize = true;

render.onTriggered = doRender;
doScale.onChange =
    makeRound.onChange =
    makeRoundAA.onChange =
    texture.onChange =
    textureColorize.onChange =
    textureMask.onChange =
    colorizeRandom.onChange =
    flipTex.onChange =
    texMaskChan.onChange =
    inPixelSize.onChange =
    textureOpacity.onChange =
    texturePointSize.onChange =
    texturePointSizeMap.onChange =
    texturePointSizeChannel.onChange =
    textureMulColor.onChange =
    vertCols.onChange = updateDefines;

updateUi();

op.preRender = function ()
{
    if (shader)shader.bind();
    doRender();
};

function doRender()
{
    uniWidth.setValue(cgl.canvasWidth);
    uniHeight.setValue(cgl.canvasHeight);

    cgl.pushShader(shader);
    shader.popTextures();
    if (texture.get() && !texture.get().deleted) shader.pushTexture(textureUniform, texture.get());
    if (textureMask.get()) shader.pushTexture(textureMaskUniform, textureMask.get());
    if (textureColorize.get()) shader.pushTexture(textureColorizeUniform, textureColorize.get());
    if (textureOpacity.get()) shader.pushTexture(textureOpacityUniform, textureOpacity.get());
    if (texturePointSize.get()) shader.pushTexture(texturePointSizeUniform, texturePointSize.get());

    trigger.trigger();

    cgl.popShader();
}

function updateUi()
{
    texMaskChan.setUiAttribs({ "greyout": !textureMask.isLinked() });

    texturePointSizeChannel.setUiAttribs({ "greyout": !texturePointSize.isLinked() });
    texturePointSizeMul.setUiAttribs({ "greyout": !texturePointSize.isLinked() });
    texturePointSizeMap.setUiAttribs({ "greyout": !texturePointSize.isLinked() });
}

function updateDefines()
{
    shader.toggleDefine("SCALE_BY_DISTANCE", doScale.get());
    shader.toggleDefine("MAKE_ROUND", makeRound.get());
    shader.toggleDefine("MAKE_ROUNDAA", makeRoundAA.get());

    shader.toggleDefine("VERTEX_COLORS", vertCols.get());
    shader.toggleDefine("RANDOM_COLORIZE", colorizeRandom.get());
    shader.toggleDefine("HAS_TEXTURE_DIFFUSE", texture.get());
    shader.toggleDefine("HAS_TEXTURE_MASK", textureMask.get());
    shader.toggleDefine("HAS_TEXTURE_COLORIZE", textureColorize.get());
    shader.toggleDefine("HAS_TEXTURE_OPACITY", textureOpacity.get());
    shader.toggleDefine("HAS_TEXTURE_POINTSIZE", texturePointSize.get());

    shader.toggleDefine("TEXTURE_COLORIZE_MUL", textureMulColor.get());

    shader.toggleDefine("FLIP_TEX", flipTex.get());
    shader.toggleDefine("TEXTURE_MASK_R", texMaskChan.get() == "R");
    shader.toggleDefine("TEXTURE_MASK_A", texMaskChan.get() == "A");
    shader.toggleDefine("TEXTURE_MASK_LUMI", texMaskChan.get() == "Luminance");
    shader.toggleDefine("PIXELSIZE", inPixelSize.get());

    shader.toggleDefine("POINTSIZE_CHAN_R", texturePointSizeChannel.get() == "R");
    shader.toggleDefine("POINTSIZE_CHAN_G", texturePointSizeChannel.get() == "G");
    shader.toggleDefine("POINTSIZE_CHAN_B", texturePointSizeChannel.get() == "B");

    shader.toggleDefine("DOTSIZEREMAPABS", texturePointSizeMap.get() == "Grey");
    updateUi();
}


};

Ops.Gl.Shader.PointMaterial_v4.prototype = new CABLES.Op();
CABLES.OPS["a7cb5d1c-cd4a-4c28-bb13-7bb9bda187ed"]={f:Ops.Gl.Shader.PointMaterial_v4,objName:"Ops.Gl.Shader.PointMaterial_v4"};




// **************************************************************
// 
// Ops.Gl.TextureToPoints
// 
// **************************************************************

Ops.Gl.TextureToPoints = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    cgl = op.patch.cgl,
    pUpdate = op.inTriggerButton("update"),
    inNum = op.inValueInt("Num Points", 2000),
    inSeed = op.inValueFloat("Seed", 1),
    zPos = op.inSwitch("Z Position", ["None", "Red", "Green", "Blue", "Alpha"], "Red"),
    zMultiply = op.inValueFloat("Z Multiply", 1.0),
    tex = op.inObject("texture"),
    outTrigger = op.outTrigger("trigger"),
    outPoints = op.outArray("Points"),
    outPointsNum = op.outValue("NumPoints");

let fb = null,
    pixelData = null,
    texChanged = false;

op.toWorkPortsNeedToBeLinked(tex, outPoints);

tex.onChange = function () { texChanged = true; };

let channelType = op.patch.cgl.gl.UNSIGNED_BYTE;
let points = [];

pUpdate.onTriggered = updatePixels;

const NUM_COL_CHANNELS = 4;

function updatePixels()
{
    let realTexture = tex.get(), gl = cgl.gl;

    if (!realTexture) return;
    if (!fb) fb = gl.createFramebuffer();

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    if (texChanged)
    {
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D, realTexture.tex, 0
        );

        pixelData = new Uint8Array(realTexture.width * realTexture.height * NUM_COL_CHANNELS);
        texChanged = false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);

    gl.readPixels(
        0, 0,
        realTexture.width,
        realTexture.height,
        gl.RGBA,
        channelType,
        pixelData
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    let num = inNum.get();
    let numPixels = pixelData.length;

    if (num * 3 != points.length)points.length = num * 3;

    Math.randomSeed = inSeed.get();

    let pixelStepX = 1 / realTexture.width;
    let pixelStepY = 1 / realTexture.height;

    let offsetX = pixelStepX * realTexture.width / 2;
    let offsetY = pixelStepY * realTexture.height / 2;

    let ind = 0;
    let count = 0;

    let colChanOffset = 0;
    if (zPos.get() == "Green")colChanOffset = 1;
    else if (zPos.get() == "Blue")colChanOffset = 2;
    else if (zPos.get() == "Alpha")colChanOffset = 3;
    else if (zPos.get() == "None")colChanOffset = 4;

    while (ind < num * 3)
    {
        count++;
        if (count > num * 3 * 100) return;
        let x = Math.floor(Math.seededRandom() * realTexture.width);
        let y = Math.floor(Math.seededRandom() * realTexture.height);
        let intens = pixelData[(x + (y * realTexture.width)) * NUM_COL_CHANNELS + colChanOffset];

        if (intens > 10)
        {
            points[ind++] = ((x * pixelStepX) - (offsetX));
            points[ind++] = ((y * pixelStepY) - (offsetY));

            if (colChanOffset < 4) points[ind++] = (intens / 255) * zMultiply.get();
            else points[ind++] = 0;
        }
    }

    outPointsNum.set(ind / 3);
    outPoints.set(null);
    outPoints.set(points);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    outTrigger.trigger();
}


};

Ops.Gl.TextureToPoints.prototype = new CABLES.Op();
CABLES.OPS["ff757f51-fbb0-4728-b158-644094cd160e"]={f:Ops.Gl.TextureToPoints,objName:"Ops.Gl.TextureToPoints"};




// **************************************************************
// 
// Ops.Math.Divide
// 
// **************************************************************

Ops.Math.Divide = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    number1 = op.inValueFloat("number1", 1),
    number2 = op.inValueFloat("number2", 2),
    result = op.outNumber("result");

op.setTitle("/");

number1.onChange = number2.onChange = exec;
exec();

function exec()
{
    result.set(number1.get() / number2.get());
}


};

Ops.Math.Divide.prototype = new CABLES.Op();
CABLES.OPS["86fcfd8c-038d-4b91-9820-a08114f6b7eb"]={f:Ops.Math.Divide,objName:"Ops.Math.Divide"};




// **************************************************************
// 
// Ops.Array.ArrayLength
// 
// **************************************************************

Ops.Array.ArrayLength = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    array = op.inArray("array"),
    outLength = op.outNumber("length");

outLength.ignoreValueSerialize = true;

function update()
{
    let l = 0;
    if (array.get()) l = array.get().length;
    else l = -1;
    outLength.set(l);
}

array.onChange = update;


};

Ops.Array.ArrayLength.prototype = new CABLES.Op();
CABLES.OPS["ea508405-833d-411a-86b4-1a012c135c8a"]={f:Ops.Array.ArrayLength,objName:"Ops.Array.ArrayLength"};




// **************************************************************
// 
// Ops.Array.RandomNumbersArray3_v2
// 
// **************************************************************

Ops.Array.RandomNumbersArray3_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    numValues = op.inValueInt("numValues", 100),
    min = op.inValueFloat("Min", -1),
    max = op.inValueFloat("Max", 1),
    seed = op.inValueFloat("random seed"),
    closed = op.inValueBool("Last == First"),
    inInteger = op.inValueBool("Integer", false),
    values = op.outArray("values", null, 3),
    outTotalPoints = op.outNumber("Total points"),
    outArrayLength = op.outNumber("Array length");

op.setPortGroup("Value Range", [min, max]);
op.setPortGroup("", [seed, closed]);

values.ignoreValueSerialize = true;

closed.onChange =
    max.onChange =
    min.onChange =
    numValues.onChange =
    seed.onChange =
    inInteger.onChange = init;

const arr = [];
init();

function init()
{
    Math.randomSeed = seed.get();

    const isInteger = inInteger.get();

    const arrLength = arr.length = Math.max(0, Math.floor(Math.abs((numValues.get() || 0) * 3)));

    if (arrLength === 0)
    {
        values.set(null);
        outTotalPoints.set(0);
        outArrayLength.set(0);
        return;
    }

    const minIn = min.get();
    const maxIn = max.get();

    for (let i = 0; i < arrLength; i += 3)
    {
        if (!isInteger)
        {
            arr[i + 0] = Math.seededRandom() * (maxIn - minIn) + minIn;
            arr[i + 1] = Math.seededRandom() * (maxIn - minIn) + minIn;
            arr[i + 2] = Math.seededRandom() * (maxIn - minIn) + minIn;
        }
        else
        {
            arr[i + 0] = Math.floor(Math.seededRandom() * ((maxIn - minIn) + 1) + minIn);
            arr[i + 1] = Math.floor(Math.seededRandom() * ((maxIn - minIn) + 1) + minIn);
            arr[i + 2] = Math.floor(Math.seededRandom() * ((maxIn - minIn) + 1) + minIn);
        }
    }

    if (closed.get() && arrLength > 3)
    {
        arr[arrLength - 3 + 0] = arr[0];
        arr[arrLength - 3 + 1] = arr[1];
        arr[arrLength - 3 + 2] = arr[2];
    }

    values.set(null);
    values.set(arr);
    outTotalPoints.set(arrLength / 3);
    outArrayLength.set(arrLength);
}


};

Ops.Array.RandomNumbersArray3_v2.prototype = new CABLES.Op();
CABLES.OPS["45b2113a-1ca0-41d8-8d90-db3e394b669c"]={f:Ops.Array.RandomNumbersArray3_v2,objName:"Ops.Array.RandomNumbersArray3_v2"};




// **************************************************************
// 
// Ops.Trigger.TriggerOnce
// 
// **************************************************************

Ops.Trigger.TriggerOnce = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTriggerButton("Exec"),
    reset = op.inTriggerButton("Reset"),
    next = op.outTrigger("Next"),
    outTriggered = op.outBoolNum("Was Triggered");

let triggered = false;

op.toWorkPortsNeedToBeLinked(exe);

reset.onTriggered = function ()
{
    triggered = false;
    outTriggered.set(triggered);
};

exe.onTriggered = function ()
{
    if (triggered) return;

    triggered = true;
    next.trigger();
    outTriggered.set(triggered);
};


};

Ops.Trigger.TriggerOnce.prototype = new CABLES.Op();
CABLES.OPS["cf3544e4-e392-432b-89fd-fcfb5c974388"]={f:Ops.Trigger.TriggerOnce,objName:"Ops.Trigger.TriggerOnce"};




// **************************************************************
// 
// Ops.Devices.Mouse.MouseButtons
// 
// **************************************************************

Ops.Devices.Mouse.MouseButtons = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    mouseClickLeft = op.outTrigger("Click Left"),
    mouseClickRight = op.outTrigger("Click Right"),
    mouseDoubleClick = op.outTrigger("Double Click"),
    mouseDownLeft = op.outBoolNum("Button pressed Left", false),
    mouseDownMiddle = op.outBoolNum("Button pressed Middle", false),
    mouseDownRight = op.outBoolNum("Button pressed Right", false),
    triggerMouseDownLeft = op.outTrigger("Mouse Down Left"),
    triggerMouseDownMiddle = op.outTrigger("Mouse Down Middle"),
    triggerMouseDownRight = op.outTrigger("Mouse Down Right"),
    triggerMouseUpLeft = op.outTrigger("Mouse Up Left"),
    triggerMouseUpMiddle = op.outTrigger("Mouse Up Middle"),
    triggerMouseUpRight = op.outTrigger("Mouse Up Right"),
    area = op.inValueSelect("Area", ["Canvas", "Document"], "Canvas"),
    active = op.inValueBool("Active", true);

const cgl = op.patch.cgl;
let listenerElement = null;
area.onChange = updateListeners;
op.onDelete = removeListeners;
updateListeners();

function onMouseDown(e)
{
    if (e.which == 1)
    {
        mouseDownLeft.set(true);
        triggerMouseDownLeft.trigger();
    }
    else if (e.which == 2)
    {
        mouseDownMiddle.set(true);
        triggerMouseDownMiddle.trigger();
    }
    else if (e.which == 3)
    {
        mouseDownRight.set(true);
        triggerMouseDownRight.trigger();
    }
}

function onMouseUp(e)
{
    if (e.which == 1)
    {
        mouseDownLeft.set(false);
        triggerMouseUpLeft.trigger();
    }
    else if (e.which == 2)
    {
        mouseDownMiddle.set(false);
        triggerMouseUpMiddle.trigger();
    }
    else if (e.which == 3)
    {
        mouseDownRight.set(false);
        triggerMouseUpRight.trigger();
    }
}

function onClickRight(e)
{
    mouseClickRight.trigger();
    e.preventDefault();
}

function onDoubleClick(e)
{
    mouseDoubleClick.trigger();
}

function onmouseclick(e)
{
    mouseClickLeft.trigger();
}

function ontouchstart(event)
{
    if (event.touches && event.touches.length > 0)
    {
        event.touches[0].which = 1;
        onMouseDown(event.touches[0]);
    }
}

function ontouchend(event)
{
    onMouseUp({ "which": 1 });
}

function removeListeners()
{
    if (!listenerElement) return;
    listenerElement.removeEventListener("touchend", ontouchend);
    listenerElement.removeEventListener("touchcancel", ontouchend);
    listenerElement.removeEventListener("touchstart", ontouchstart);
    listenerElement.removeEventListener("dblclick", onDoubleClick);
    listenerElement.removeEventListener("click", onmouseclick);
    listenerElement.removeEventListener("mousedown", onMouseDown);
    listenerElement.removeEventListener("mouseup", onMouseUp);
    listenerElement.removeEventListener("contextmenu", onClickRight);
    listenerElement.removeEventListener("mouseleave", onMouseUp);
    listenerElement = null;
}

function addListeners()
{
    if (listenerElement)removeListeners();

    listenerElement = cgl.canvas;
    if (area.get() == "Document") listenerElement = document.body;

    listenerElement.addEventListener("touchend", ontouchend);
    listenerElement.addEventListener("touchcancel", ontouchend);
    listenerElement.addEventListener("touchstart", ontouchstart);
    listenerElement.addEventListener("dblclick", onDoubleClick);
    listenerElement.addEventListener("click", onmouseclick);
    listenerElement.addEventListener("mousedown", onMouseDown);
    listenerElement.addEventListener("mouseup", onMouseUp);
    listenerElement.addEventListener("contextmenu", onClickRight);
    listenerElement.addEventListener("mouseleave", onMouseUp);
}

op.onLoaded = updateListeners;

active.onChange = updateListeners;

function updateListeners()
{
    removeListeners();
    if (active.get()) addListeners();
}


};

Ops.Devices.Mouse.MouseButtons.prototype = new CABLES.Op();
CABLES.OPS["c7e5e545-c8a1-4fef-85c2-45422b947f0d"]={f:Ops.Devices.Mouse.MouseButtons,objName:"Ops.Devices.Mouse.MouseButtons"};




// **************************************************************
// 
// Ops.Gl.Performance
// 
// **************************************************************

Ops.Gl.Performance = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    inShow = op.inValueBool("Visible", true),
    next = op.outTrigger("childs"),
    position = op.inSwitch("Position", ["top", "bottom"], "top"),
    openDefault = op.inBool("Open", false),
    smoothGraph = op.inBool("Smooth Graph", true),
    inScaleGraph = op.inFloat("Scale", 4),
    inSizeGraph = op.inFloat("Size", 128),
    outCanv = op.outObject("Canvas"),
    outFPS = op.outNumber("FPS");

const cgl = op.patch.cgl;
const element = document.createElement("div");

let elementMeasures = null;
let ctx = null;
let opened = false;
let frameCount = 0;
let fps = 0;
let fpsStartTime = 0;
let childsTime = 0;
let avgMsChilds = 0;
const queue = [];
const timesMainloop = [];
const timesOnFrame = [];
const timesGPU = [];
let avgMs = 0;
let selfTime = 0;
let canvas = null;
let lastTime = 0;
let loadingCounter = 0;
const loadingChars = ["|", "/", "-", "\\"];
let initMeasures = true;

const colorRAFSlow = "#ffffff";
const colorBg = "#222222";
const colorRAF = "#003f5c"; // color: https://learnui.design/tools/data-color-picker.html
const colorMainloop = "#7a5195";
const colorOnFrame = "#ef5675";
const colorGPU = "#ffa600";

let startedQuery = false;

let currentTimeGPU = 0;
let currentTimeMainloop = 0;
let currentTimeOnFrame = 0;

const gl = op.patch.cgl.gl;
const glQueryExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
// let query = null;

exe.onLinkChanged =
    inShow.onChange = () =>
    {
        updateOpened();
        updateVisibility();
    };

position.onChange = updatePos;
inSizeGraph.onChange = updateSize;

element.id = "performance";
element.style.position = "absolute";
element.style.left = "0px";
element.style.opacity = "0.8";
element.style.padding = "10px";
element.style.cursor = "pointer";
element.style.background = "#222";
element.style.color = "white";
element.style["font-family"] = "monospace";
element.style["font-size"] = "12px";
element.style["z-index"] = "99999";

element.innerHTML = "&nbsp;";
element.addEventListener("click", toggleOpened);

const container = op.patch.cgl.canvas.parentElement;
container.appendChild(element);

updateSize();
updateOpened();
updatePos();
updateVisibility();

op.onDelete = function ()
{
    if (canvas)canvas.remove();
    if (element)element.remove();
};

function updatePos()
{
    canvas.style["pointer-events"] = "none";
    if (position.get() == "top")
    {
        canvas.style.top = element.style.top = "0px";
        canvas.style.bottom = element.style.bottom = "initial";
    }
    else
    {
        canvas.style.bottom = element.style.bottom = "0px";
        canvas.style.top = element.style.top = "initial";
    }
}

function updateVisibility()
{
    if (!inShow.get() || !exe.isLinked())
    {
        element.style.display = "none";
        element.style.opacity = 0;
        canvas.style.display = "none";
    }
    else
    {
        element.style.display = "block";
        element.style.opacity = 1;
        canvas.style.display = "block";
    }
}

function updateSize()
{
    if (!canvas) return;

    const num = Math.max(0, parseInt(inSizeGraph.get()));

    canvas.width = num;
    canvas.height = num;
    element.style.left = num + "px";

    queue.length = 0;
    timesMainloop.length = 0;
    timesOnFrame.length = 0;
    timesGPU.length = 0;

    for (let i = 0; i < num; i++)
    {
        queue[i] = -1;
        timesMainloop[i] = -1;
        timesOnFrame[i] = -1;
        timesGPU[i] = -1;
    }
}

openDefault.onChange = function ()
{
    opened = openDefault.get();
    updateOpened();
};

function toggleOpened()
{
    if (!inShow.get()) return;
    element.style.opacity = 1;
    opened = !opened;
    updateOpened();
}

function updateOpened()
{
    updateText();
    if (!canvas)createCanvas();
    if (opened)
    {
        canvas.style.display = "block";
        element.style.left = inSizeGraph.get() + "px";
        element.style["min-height"] = "56px";
    }
    else
    {
        canvas.style.display = "none";
        element.style.left = "0px";
        element.style["min-height"] = "auto";
    }
}

function updateCanvas()
{
    const height = canvas.height;
    const hmul = inScaleGraph.get();

    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, canvas.width, height);
    ctx.fillStyle = colorRAF;

    let k = 0;
    const numBars = Math.max(0, parseInt(inSizeGraph.get()));

    for (k = numBars; k >= 0; k--)
    {
        if (queue[k] > 30)ctx.fillStyle = colorRAFSlow;
        ctx.fillRect(numBars - k, height - queue[k] * hmul, 1, queue[k] * hmul);
        if (queue[k] > 30)ctx.fillStyle = colorRAF;
    }

    for (k = numBars; k >= 0; k--)
    {
        let sum = 0;
        ctx.fillStyle = colorMainloop;
        sum = timesMainloop[k];
        ctx.fillRect(numBars - k, height - sum * hmul, 1, timesMainloop[k] * hmul);

        ctx.fillStyle = colorOnFrame;
        sum += timesOnFrame[k];
        ctx.fillRect(numBars - k, height - sum * hmul, 1, timesOnFrame[k] * hmul);

        ctx.fillStyle = colorGPU;
        sum += timesGPU[k];
        ctx.fillRect(numBars - k, height - sum * hmul, 1, timesGPU[k] * hmul);
    }
}

function createCanvas()
{
    canvas = document.createElement("canvas");
    canvas.id = "performance_" + op.patch.config.glCanvasId;
    canvas.width = inSizeGraph.get();
    canvas.height = inSizeGraph.get();
    canvas.style.display = "block";
    canvas.style.opacity = 0.9;
    canvas.style.position = "absolute";
    canvas.style.left = "0px";
    canvas.style.cursor = "pointer";
    canvas.style.top = "-64px";
    canvas.style["z-index"] = "99998";
    container.appendChild(canvas);
    ctx = canvas.getContext("2d");

    canvas.addEventListener("click", toggleOpened);

    updateSize();
}

function updateText()
{
    if (!inShow.get()) return;
    let warn = "";

    if (op.patch.cgl.profileData.profileShaderCompiles > 0)warn += "Shader compile (" + op.patch.cgl.profileData.profileShaderCompileName + ") ";
    if (op.patch.cgl.profileData.profileShaderGetUniform > 0)warn += "Shader get uni loc! (" + op.patch.cgl.profileData.profileShaderGetUniformName + ")";
    if (op.patch.cgl.profileData.profileTextureResize > 0)warn += "Texture resize! ";
    if (op.patch.cgl.profileData.profileFrameBuffercreate > 0)warn += "Framebuffer create! ";
    if (op.patch.cgl.profileData.profileEffectBuffercreate > 0)warn += "Effectbuffer create! ";
    if (op.patch.cgl.profileData.profileTextureDelete > 0)warn += "Texture delete! ";
    if (op.patch.cgl.profileData.profileNonTypedAttrib > 0)warn += "Not-Typed Buffer Attrib! " + op.patch.cgl.profileData.profileNonTypedAttribNames;
    if (op.patch.cgl.profileData.profileTextureNew > 0)warn += "new texture created! ";
    if (op.patch.cgl.profileData.profileGenMipMap > 0)warn += "generating mip maps!";

    if (warn.length > 0)
    {
        warn = "| <span style=\"color:#f80;\">WARNING: " + warn + "<span>";
    }

    let html = "";

    if (opened)
    {
        html += "<span style=\"color:" + colorRAF + "\">■</span> " + fps + " fps ";
        html += "<span style=\"color:" + colorMainloop + "\">■</span> " + Math.round(currentTimeMainloop * 100) / 100 + "ms mainloop ";
        html += "<span style=\"color:" + colorOnFrame + "\">■</span> " + Math.round((currentTimeOnFrame) * 100) / 100 + "ms onframe ";
        if (currentTimeGPU) html += "<span style=\"color:" + colorGPU + "\">■</span> " + Math.round(currentTimeGPU * 100) / 100 + "ms GPU";
        html += warn;
        element.innerHTML = html;
    }
    else
    {
        html += fps + " fps / ";
        html += "CPU: " + Math.round((currentTimeMainloop + op.patch.cgl.profileData.profileOnAnimFrameOps) * 100) / 100 + "ms / ";
        if (currentTimeGPU)html += "GPU: " + Math.round(currentTimeGPU * 100) / 100 + "ms  ";
        element.innerHTML = html;
    }

    if (op.patch.loading.getProgress() != 1.0)
    {
        element.innerHTML += "<br/>loading " + Math.round(op.patch.loading.getProgress() * 100) + "% " + loadingChars[(++loadingCounter) % loadingChars.length];
    }

    if (opened)
    {
        let count = 0;
        avgMs = 0;
        avgMsChilds = 0;
        for (let i = queue.length; i > queue.length - queue.length / 3; i--)
        {
            if (queue[i] > -1)
            {
                avgMs += queue[i];
                count++;
            }

            if (timesMainloop[i] > -1) avgMsChilds += timesMainloop[i];
        }

        avgMs /= count;
        avgMsChilds /= count;

        element.innerHTML += "<br/> " + cgl.canvasWidth + " x " + cgl.canvasHeight + " (x" + cgl.pixelDensity + ") ";
        element.innerHTML += "<br/>frame avg: " + Math.round(avgMsChilds * 100) / 100 + " ms (" + Math.round(avgMsChilds / avgMs * 100) + "%) / " + Math.round(avgMs * 100) / 100 + " ms";
        element.innerHTML += " (self: " + Math.round((selfTime) * 100) / 100 + " ms) ";

        element.innerHTML += "<br/>shader binds: " + Math.ceil(op.patch.cgl.profileData.profileShaderBinds / fps) +
            " uniforms: " + Math.ceil(op.patch.cgl.profileData.profileUniformCount / fps) +
            " mvp_uni_mat4: " + Math.ceil(op.patch.cgl.profileData.profileMVPMatrixCount / fps) +
            " num glPrimitives: " + Math.ceil(op.patch.cgl.profileData.profileMeshNumElements / (fps)) +

            " mesh.setGeom: " + op.patch.cgl.profileData.profileMeshSetGeom +
            " videos: " + op.patch.cgl.profileData.profileVideosPlaying +
            " tex preview: " + op.patch.cgl.profileData.profileTexPreviews;

        element.innerHTML +=
        " draw meshes: " + Math.ceil(op.patch.cgl.profileData.profileMeshDraw / fps) +
        " framebuffer blit: " + Math.ceil(op.patch.cgl.profileData.profileFramebuffer / fps) +
        " texeffect blit: " + Math.ceil(op.patch.cgl.profileData.profileTextureEffect / fps);

        element.innerHTML += " all shader compiletime: " + Math.round(op.patch.cgl.profileData.shaderCompileTime * 100) / 100;
    }

    op.patch.cgl.profileData.clear();
}

function styleMeasureEle(ele)
{
    ele.style.padding = "0px";
    ele.style.margin = "0px";
}

function addMeasureChild(m, parentEle, timeSum, level)
{
    const height = 20;
    m.usedAvg = (m.usedAvg || m.used);

    if (!m.ele || initMeasures)
    {
        const newEle = document.createElement("div");
        m.ele = newEle;

        if (m.childs && m.childs.length > 0) newEle.style.height = "500px";
        else newEle.style.height = height + "px";

        newEle.style.overflow = "hidden";
        newEle.style.display = "inline-block";

        if (!m.isRoot)
        {
            newEle.innerHTML = "<div style=\"min-height:" + height + "px;width:100%;overflow:hidden;color:black;position:relative\">&nbsp;" + m.name + "</div>";
            newEle.style["background-color"] = "rgb(" + m.colR + "," + m.colG + "," + m.colB + ")";
            newEle.style["border-left"] = "1px solid black";
        }

        parentEle.appendChild(newEle);
    }

    if (!m.isRoot)
    {
        if (performance.now() - m.lastTime > 200)
        {
            m.ele.style.display = "none";
            m.hidden = true;
        }
        else
        {
            if (m.hidden)
            {
                m.ele.style.display = "inline-block";
                m.hidden = false;
            }
        }

        m.ele.style.float = "left";
        m.ele.style.width = Math.floor((m.usedAvg / timeSum) * 98.0) + "%";
    }
    else
    {
        m.ele.style.width = "100%";
        m.ele.style.clear = "both";
        m.ele.style.float = "none";
    }

    if (m && m.childs && m.childs.length > 0)
    {
        let thisTimeSum = 0;
        for (var i = 0; i < m.childs.length; i++)
        {
            m.childs[i].usedAvg = (m.childs[i].usedAvg || m.childs[i].used) * 0.95 + m.childs[i].used * 0.05;
            thisTimeSum += m.childs[i].usedAvg;
        }
        for (var i = 0; i < m.childs.length; i++)
        {
            addMeasureChild(m.childs[i], m.ele, thisTimeSum, level + 1);
        }
    }
}

function clearMeasures(p)
{
    for (let i = 0; i < p.childs.length; i++) clearMeasures(p.childs[i]);
    p.childs.length = 0;
}

function measures()
{
    if (!CGL.performanceMeasures) return;

    if (!elementMeasures)
    {
        op.log("create measure ele");
        elementMeasures = document.createElement("div");
        elementMeasures.style.width = "100%";
        elementMeasures.style["background-color"] = "#444";
        elementMeasures.style.bottom = "10px";
        elementMeasures.style.height = "100px";
        elementMeasures.style.opacity = "1";
        elementMeasures.style.position = "absolute";
        elementMeasures.style["z-index"] = "99999";
        elementMeasures.innerHTML = "";
        container.appendChild(elementMeasures);
    }

    let timeSum = 0;
    const root = CGL.performanceMeasures[0];

    for (let i = 0; i < root.childs.length; i++) timeSum += root.childs[i].used;

    addMeasureChild(CGL.performanceMeasures[0], elementMeasures, timeSum, 0);

    root.childs.length = 0;

    clearMeasures(CGL.performanceMeasures[0]);

    CGL.performanceMeasures.length = 0;
    initMeasures = false;
}

exe.onTriggered = render;

function render()
{
    const selfTimeStart = performance.now();
    frameCount++;

    if (glQueryExt && inShow.get())op.patch.cgl.profileData.doProfileGlQuery = true;

    if (fpsStartTime === 0)fpsStartTime = Date.now();
    if (Date.now() - fpsStartTime >= 1000)
    {
        // query=null;
        fps = frameCount;
        frameCount = 0;
        // frames = 0;
        outFPS.set(fps);
        if (inShow.get())updateText();

        fpsStartTime = Date.now();
    }

    const glQueryData = op.patch.cgl.profileData.glQueryData;
    currentTimeGPU = 0;
    if (glQueryData)
    {
        let count = 0;
        for (let i in glQueryData)
        {
            count++;
            if (glQueryData[i].time)
                currentTimeGPU += glQueryData[i].time;
        }
    }

    if (inShow.get())
    {
        measures();

        if (opened && !op.patch.cgl.profileData.pause)
        {
            const timeUsed = performance.now() - lastTime;
            queue.push(timeUsed);
            queue.shift();

            timesMainloop.push(childsTime);
            timesMainloop.shift();

            timesOnFrame.push(op.patch.cgl.profileData.profileOnAnimFrameOps - op.patch.cgl.profileData.profileMainloopMs);
            timesOnFrame.shift();

            timesGPU.push(currentTimeGPU);
            timesGPU.shift();

            updateCanvas();
        }
    }

    lastTime = performance.now();
    selfTime = performance.now() - selfTimeStart;
    const startTimeChilds = performance.now();

    outCanv.set(null);
    outCanv.set(canvas);

    // startGlQuery();
    next.trigger();
    // endGlQuery();

    const nChildsTime = performance.now() - startTimeChilds;
    const nCurrentTimeMainloop = op.patch.cgl.profileData.profileMainloopMs;
    const nCurrentTimeOnFrame = op.patch.cgl.profileData.profileOnAnimFrameOps - op.patch.cgl.profileData.profileMainloopMs;

    if (smoothGraph.get())
    {
        childsTime = childsTime * 0.9 + nChildsTime * 0.1;
        currentTimeMainloop = currentTimeMainloop * 0.5 + nCurrentTimeMainloop * 0.5;
        currentTimeOnFrame = currentTimeOnFrame * 0.5 + nCurrentTimeOnFrame * 0.5;
    }
    else
    {
        childsTime = nChildsTime;
        currentTimeMainloop = nCurrentTimeMainloop;
        currentTimeOnFrame = nCurrentTimeOnFrame;
    }

    op.patch.cgl.profileData.clearGlQuery();
}


};

Ops.Gl.Performance.prototype = new CABLES.Op();
CABLES.OPS["9cd2d9de-000f-4a14-bd13-e7d5f057583c"]={f:Ops.Gl.Performance,objName:"Ops.Gl.Performance"};




// **************************************************************
// 
// Ops.Array.InterpolateArraysRange
// 
// **************************************************************

Ops.Array.InterpolateArraysRange = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const exe = op.inTrigger("Exe");
const inArr1 = op.inArray("Array 1");
const inArr2 = op.inArray("Array 2");

const inPos = op.inValueSlider("Pos");
const inWidth = op.inValueSlider("Width");

const easing = op.inValueSelect("Easing", [
    "Linear",
    "Expo in", "Expo out", "Expo in out",
    "Cubic in", "Cubic out", "Cubic in out"],
"Linear");

const reverse = op.inValueBool("Reverse");

const next = op.outTrigger("Next");
const outArr = op.outArray("Result");

const resultArr = [];
let easingFunction = null;

easing.onChange = function ()
{
    if (easing.get() == "Expo in") easingFunction = CABLES.easeExpoIn;
    else if (easing.get() == "Expo out") easingFunction = CABLES.easeExpoOut;
    else if (easing.get() == "Expo in out") easingFunction = CABLES.easeExpoInOut;
    else if (easing.get() == "Cubic in") easingFunction = CABLES.easeCubicIn;
    else if (easing.get() == "Cubic out") easingFunction = CABLES.easeCubicOut;
    else if (easing.get() == "Cubic in out") easingFunction = CABLES.easeCubicInOut;
    else easingFunction = null;
};

let needsUpdate = true;

inArr1.onChange =
inArr2.onChange =
inPos.onChange =
inWidth.onChange = () =>
{
    needsUpdate = true;
};

exe.onTriggered = function ()
{
    const arr1 = inArr1.get();
    const arr2 = inArr2.get();

    if (needsUpdate)
        if (!arr1 || !arr2 || arr2.length < arr1.length)
        {
            outArr.set(null);
        }
        else
        {
            if (resultArr.length != arr1.length) resultArr.length = arr1.length;
            const distNum = inWidth.get() * (resultArr.length * 4);
            const pos = inPos.get() * (arr1.length + distNum);

            for (let i = 0; i < arr1.length; i++)
            {
                const val1 = arr1[i];
                const val2 = arr2[i];

                let ppos = pos - i;
                if (reverse.get())ppos = pos - (arr1.length - i);
                let dist = ppos / distNum;

                if (dist > 1) resultArr[i] = val2;
                else if (dist <= 0) resultArr[i] = val1;
                else
                {
                    if (easingFunction) dist = easingFunction(dist);
                    const m = ((val2 - val1) * dist + val1);
                    resultArr[i] = m;
                }
            }

            outArr.set(null);
            outArr.set(resultArr);
        }

    next.trigger();
    needsUpdate = false;
};


};

Ops.Array.InterpolateArraysRange.prototype = new CABLES.Op();
CABLES.OPS["f89f5664-7cfa-4598-b09c-e4320b588b45"]={f:Ops.Array.InterpolateArraysRange,objName:"Ops.Array.InterpolateArraysRange"};




// **************************************************************
// 
// Ops.Anim.Bang
// 
// **************************************************************

Ops.Anim.Bang = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    inUpdate = op.inTrigger("update"),
    inBang = op.inTriggerButton("Bang"),
    inDuration = op.inValue("Duration", 0.1),
    invert = op.inBool("Invert", false),
    outTrigger = op.outTrigger("Trigger Out"),
    outValue = op.outNumber("Value");

const anim = new CABLES.Anim();
let startTime = CABLES.now();
op.toWorkPortsNeedToBeLinked(inUpdate);

inBang.onTriggered = function ()
{
    startTime = CABLES.now();

    anim.clear();
    anim.setValue(0, 1);
    anim.setValue(inDuration.get(), 0);
};

inUpdate.onTriggered = function ()
{
    let v = anim.getValue((CABLES.now() - startTime) / 1000);
    if (invert.get()) outValue.set(1.0 - v);
    else outValue.set(v);

    outTrigger.trigger();
};


};

Ops.Anim.Bang.prototype = new CABLES.Op();
CABLES.OPS["92ca45a7-5b4b-4238-956e-23d79bdc659f"]={f:Ops.Anim.Bang,objName:"Ops.Anim.Bang"};




// **************************************************************
// 
// Ops.Trigger.TriggerSend
// 
// **************************************************************

Ops.Trigger.TriggerSend = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const trigger = op.inTriggerButton("Trigger");
op.varName = op.inValueSelect("Named Trigger", [], "", true);

op.varName.onChange = updateName;

trigger.onTriggered = doTrigger;

op.patch.addEventListener("namedTriggersChanged", updateVarNamesDropdown);

updateVarNamesDropdown();

function updateVarNamesDropdown()
{
    if (CABLES.UI)
    {
        const varnames = [];
        const vars = op.patch.namedTriggers;
        varnames.push("+ create new one");
        for (const i in vars) varnames.push(i);
        op.varName.uiAttribs.values = varnames;
    }
}

function updateName()
{
    if (CABLES.UI)
    {
        if (op.varName.get() == "+ create new one")
        {
            new CABLES.UI.ModalDialog({
                "prompt": true,
                "title": "New Trigger",
                "text": "enter a name for the new trigger",
                "promptValue": "",
                "promptOk": (str) =>
                {
                    op.varName.set(str);
                    op.patch.namedTriggers[str] = op.patch.namedTriggers[str] || [];
                    updateVarNamesDropdown();
                }
            });
            return;
        }

        op.refreshParams();
    }

    if (!op.patch.namedTriggers[op.varName.get()])
    {
        op.patch.namedTriggers[op.varName.get()] = op.patch.namedTriggers[op.varName.get()] || [];
        op.patch.emitEvent("namedTriggersChanged");
    }

    op.setTitle(">" + op.varName.get());

    op.refreshParams();
    op.patch.emitEvent("opTriggerNameChanged", op, op.varName.get());
}

function doTrigger()
{
    const arr = op.patch.namedTriggers[op.varName.get()];
    // fire an event even if noone is receiving this trigger
    // this way TriggerReceiveFilter can still handle it
    op.patch.emitEvent("namedTriggerSent", op.varName.get());

    if (!arr)
    {
        op.setUiError("unknowntrigger", "unknown trigger");
        return;
    }
    else op.setUiError("unknowntrigger", null);

    for (let i = 0; i < arr.length; i++)
    {
        arr[i]();
    }
}


};

Ops.Trigger.TriggerSend.prototype = new CABLES.Op();
CABLES.OPS["ce1eaf2b-943b-4dc0-ab5e-ee11b63c9ed0"]={f:Ops.Trigger.TriggerSend,objName:"Ops.Trigger.TriggerSend"};




// **************************************************************
// 
// Ops.Trigger.TriggerReceive
// 
// **************************************************************

Ops.Trigger.TriggerReceive = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const next = op.outTrigger("Triggered");
op.varName = op.inValueSelect("Named Trigger", [], "", true);

updateVarNamesDropdown();
op.patch.addEventListener("namedTriggersChanged", updateVarNamesDropdown);

let oldName = null;

function doTrigger()
{
    next.trigger();
}

function updateVarNamesDropdown()
{
    if (CABLES.UI)
    {
        let varnames = [];
        let vars = op.patch.namedTriggers;
        // varnames.push('+ create new one');
        for (let i in vars) varnames.push(i);
        op.varName.uiAttribs.values = varnames;
    }
}

op.varName.onChange = function ()
{
    if (oldName)
    {
        let oldCbs = op.patch.namedTriggers[oldName];
        let a = oldCbs.indexOf(doTrigger);
        if (a != -1) oldCbs.splice(a, 1);
    }

    op.setTitle(">" + op.varName.get());
    op.patch.namedTriggers[op.varName.get()] = op.patch.namedTriggers[op.varName.get()] || [];
    let cbs = op.patch.namedTriggers[op.varName.get()];

    cbs.push(doTrigger);
    oldName = op.varName.get();
    updateError();
    op.patch.emitEvent("opTriggerNameChanged", op, op.varName.get());
};

op.on("uiParamPanel", updateError);

function updateError()
{
    if (!op.varName.get())
    {
        op.setUiError("unknowntrigger", "unknown trigger");
    }
    else op.setUiError("unknowntrigger", null);
}


};

Ops.Trigger.TriggerReceive.prototype = new CABLES.Op();
CABLES.OPS["0816c999-f2db-466b-9777-2814573574c5"]={f:Ops.Trigger.TriggerReceive,objName:"Ops.Trigger.TriggerReceive"};




// **************************************************************
// 
// Ops.Ui.VizGraph
// 
// **************************************************************

Ops.Ui.VizGraph = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    inNum1 = op.inFloat("Number 1"),
    inNum2 = op.inFloat("Number 2"),
    inNum3 = op.inFloat("Number 3"),
    inNum4 = op.inFloat("Number 4"),
    inNum5 = op.inFloat("Number 5"),
    inNum6 = op.inFloat("Number 6"),
    inNum7 = op.inFloat("Number 7"),
    inNum8 = op.inFloat("Number 8"),
    inReset = op.inTriggerButton("Reset");

op.setUiAttrib({ "height": 150, "resizable": true });

let buff = [];

let max = -Number.MAX_VALUE;
let min = Number.MAX_VALUE;

inNum1.onLinkChanged =
    inNum2.onLinkChanged =
    inNum3.onLinkChanged =
    inNum4.onLinkChanged =
    inNum5.onLinkChanged =
    inNum6.onLinkChanged =
    inNum7.onLinkChanged =
    inNum8.onLinkChanged =
    inReset.onTriggered = () =>
    {
        max = -Number.MAX_VALUE;
        min = Number.MAX_VALUE;
        buff = [];
    };

op.renderVizLayer = (ctx, layer) =>
{
    const perf = CABLES.UI.uiProfiler.start("previewlayer graph");

    const colors = [
        "#00ffff",
        "#ffff00",
        "#ff00ff",
        "#0000ff",
        "#00ff00",
        "#ff0000",
        "#ffffff",
        "#888888",
    ];

    ctx.fillStyle = "#222";
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);

    for (let p = 0; p < op.portsIn.length; p++)
    {
        if (!op.portsIn[p].isLinked()) continue;
        const newVal = op.portsIn[p].get();

        max = Math.max(op.portsIn[p].get(), max);
        min = Math.min(op.portsIn[p].get(), min);

        if (!buff[p]) buff[p] = [];
        buff[p].push(newVal);
        if (buff[p].length > 60) buff[p].shift();

        const texSlot = 5;
        const mulX = layer.width / 60;

        ctx.lineWidth = 2;
        ctx.strokeStyle = "#555555";

        ctx.beginPath();
        ctx.moveTo(layer.x, CABLES.map(0, min, max, layer.height, 0) + layer.y);
        ctx.lineTo(layer.x + layer.width, CABLES.map(0, min, max, layer.height, 0) + layer.y);
        ctx.stroke();

        ctx.strokeStyle = colors[p];

        ctx.beginPath();

        for (let i = 0; i < buff[p].length; i++)
        {
            let y = buff[p][i];

            y = CABLES.map(y, min, max, layer.height, 0);
            y += layer.y;
            if (i === 0)ctx.moveTo(layer.x, y);
            else ctx.lineTo(layer.x + i * mulX, y);
        }

        ctx.stroke();
    }

    ctx.fillStyle = "#888";
    ctx.fillText("max:" + Math.round(max * 100) / 100, layer.x + 10, layer.y + layer.height - 10);
    ctx.fillText("min:" + Math.round(min * 100) / 100, layer.x + 10, layer.y + layer.height - 30);

    perf.finish();
};


};

Ops.Ui.VizGraph.prototype = new CABLES.Op();
CABLES.OPS["13c54eb4-60ef-4b9c-8425-d52a431f5c87"]={f:Ops.Ui.VizGraph,objName:"Ops.Ui.VizGraph"};




// **************************************************************
// 
// Ops.Array.ArraySin
// 
// **************************************************************

Ops.Array.ArraySin = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
// this op allows the user to perform sin or cos
// math functions on an array
const inArray = op.inArray("array in");
const mathSelect = op.inValueSelect("Math function", ["Sin", "Cos"], "Sin");
const outArray = op.outArray("Array result");

const phase = op.inValue("Phase", 0.0);
const multiply = op.inValue("Frequency", 1.0);
const amplitude = op.inValue("Amplitude", 1.0);

const mathArray = [];
let selectIndex = 0;

const MATH_FUNC_SIN = 0;
const MATH_FUNC_COS = 1;


inArray.onChange = update;
multiply.onChange = update;
amplitude.onChange = update;
phase.onChange = update;
mathSelect.onChange = onFilterChange;

function onFilterChange()
{
    const mathSelectValue = mathSelect.get();
    if (mathSelectValue === "Sin") selectIndex = MATH_FUNC_SIN;
    else if (mathSelectValue === "Cos") selectIndex = MATH_FUNC_COS;
    update();
}

function update()
{
    const arrayIn = inArray.get();


    if (!arrayIn)
    {
        mathArray.length = 0;
        return;
    }

    mathArray.length = arrayIn.length;

    const amp = amplitude.get();
    const mul = multiply.get();
    const pha = phase.get();

    let i = 0;
    if (selectIndex === MATH_FUNC_SIN)
    {
        for (i = 0; i < arrayIn.length; i++)
            mathArray[i] = amp * Math.sin((arrayIn[i]) * mul + pha);
    }
    else if (selectIndex === MATH_FUNC_COS)
    {
        for (i = 0; i < arrayIn.length; i++)
            mathArray[i] = amp * (Math.cos(arrayIn[i] * mul + pha));
    }
    outArray.set(null);
    outArray.set(mathArray);
}


};

Ops.Array.ArraySin.prototype = new CABLES.Op();
CABLES.OPS["ded44bae-a24e-48c5-9585-4cb31f331ab6"]={f:Ops.Array.ArraySin,objName:"Ops.Array.ArraySin"};




// **************************************************************
// 
// Ops.Array.SortArray
// 
// **************************************************************

Ops.Array.SortArray = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const arrayIn = op.inArray("Array to sort"),
    sortMode = op.inSwitch("Sorting mode", ["Sort ascending", "Sort descending"], "Sort ascending"),
    arrayOut = op.outArray("Sorted array");
let arrOut = [];

arrayIn.onChange = sortMode.onChange = update;
update();

function update()
{
    let arrIn = arrayIn.get();

    arrOut.length = 0;

    if (!arrIn)
    {
        arrayOut.set(null);
        return;
    }

    arrOut.length = arrIn.length;

    let i;
    for (i = 0; i < arrIn.length; i++)
    {
        arrOut[i] = arrIn[i];
    }

    if (sortMode.get() === "Sort ascending")
    {
        arrOut.sort(function (a, b) { return a - b; });
    }
    else
    {
        arrOut.sort(function (a, b) { return b - a; });
    }

    arrayOut.set(null);
    arrayOut.set(arrOut);
}


};

Ops.Array.SortArray.prototype = new CABLES.Op();
CABLES.OPS["9ab49d2c-b4e4-4fc2-9e6e-8e664e094369"]={f:Ops.Array.SortArray,objName:"Ops.Array.SortArray"};




// **************************************************************
// 
// Ops.Array.ArrayMathArray
// 
// **************************************************************

Ops.Array.ArrayMathArray = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const inArray_0 = op.inArray("array 0"),
    inArray_1 = op.inArray("array 1"),
    mathSelect = op.inSwitch("Math function", ["+", "-", "*", "/", "%", "min", "max"], "+"),
    outArray = op.outArray("Array result"),
    outArrayLength = op.outNumber("Array length");

let mathFunc;

let showingError = false;

const mathArray = [];

op.toWorkPortsNeedToBeLinked(inArray_1, inArray_0);

mathSelect.onChange = onFilterChange;

inArray_0.onChange = inArray_1.onChange = update;
onFilterChange();

function onFilterChange()
{
    const mathSelectValue = mathSelect.get();

    if (mathSelectValue === "+") mathFunc = function (a, b) { return a + b; };
    else if (mathSelectValue === "-") mathFunc = function (a, b) { return a - b; };
    else if (mathSelectValue === "*") mathFunc = function (a, b) { return a * b; };
    else if (mathSelectValue === "/") mathFunc = function (a, b) { return a / b; };
    else if (mathSelectValue === "%") mathFunc = function (a, b) { return a % b; };
    else if (mathSelectValue === "min") mathFunc = function (a, b) { return Math.min(a, b); };
    else if (mathSelectValue === "max") mathFunc = function (a, b) { return Math.max(a, b); };
    update();
    op.setUiAttrib({ "extendTitle": mathSelectValue });
}

function update()
{
    const array0 = inArray_0.get();
    const array1 = inArray_1.get();

    if (!array0 || !array1)
    {
        outArray.set(null);
        outArrayLength.set(0);
        return;
    }

    const l = mathArray.length = array0.length;

    for (let i = 0; i < l; i++)
    {
        mathArray[i] = mathFunc(array0[i], array1[i]);
    }

    outArray.set(null);
    outArrayLength.set(mathArray.length);
    outArray.set(mathArray);
}


};

Ops.Array.ArrayMathArray.prototype = new CABLES.Op();
CABLES.OPS["f31a1764-ce14-41de-9b3f-dc2fe249bb52"]={f:Ops.Array.ArrayMathArray,objName:"Ops.Array.ArrayMathArray"};




// **************************************************************
// 
// Ops.Devices.Mouse.MouseWheel_v2
// 
// **************************************************************

Ops.Devices.Mouse.MouseWheel_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    speed = op.inValue("Speed", 1),
    preventScroll = op.inValueBool("prevent scroll", true),
    flip = op.inValueBool("Flip Direction"),
    inSimpleIncrement = op.inBool("Simple Delta", true),
    area = op.inSwitch("Area", ["Canvas", "Document", "Parent"], "Document"),
    active = op.inValueBool("active", true),
    delta = op.outNumber("delta", 0),
    deltaX = op.outNumber("delta X", 0),
    deltaOrig = op.outNumber("browser event delta", 0),
    trigger = op.outTrigger("Wheel Action");

const cgl = op.patch.cgl;
const value = 0;

const startTime = CABLES.now() / 1000.0;
const v = 0;

let dir = 1;

let listenerElement = null;

area.onChange = updateArea;
const vOut = 0;

addListener();

const isChromium = window.chrome,
    winNav = window.navigator,
    vendorName = winNav.vendor,
    isOpera = winNav.userAgent.indexOf("OPR") > -1,
    isIEedge = winNav.userAgent.indexOf("Edge") > -1,
    isIOSChrome = winNav.userAgent.match("CriOS");

const isWindows = window.navigator.userAgent.indexOf("Windows") != -1;
const isLinux = window.navigator.userAgent.indexOf("Linux") != -1;
const isMac = window.navigator.userAgent.indexOf("Mac") != -1;

const isChrome = (isChromium !== null && isChromium !== undefined && vendorName === "Google Inc." && isOpera === false && isIEedge === false);
const isFirefox = navigator.userAgent.search("Firefox") > 1;

flip.onChange = function ()
{
    if (flip.get())dir = -1;
    else dir = 1;
};

function normalizeWheel(event)
{
    let sY = 0;

    if ("detail" in event) { sY = event.detail; }

    if ("deltaY" in event)
    {
        sY = event.deltaY;
        if (event.deltaY > 20)sY = 20;
        else if (event.deltaY < -20)sY = -20;
    }
    return sY * dir;
}

function normalizeWheelX(event)
{
    let sX = 0;

    if ("deltaX" in event)
    {
        sX = event.deltaX;
        if (event.deltaX > 20)sX = 20;
        else if (event.deltaX < -20)sX = -20;
    }
    return sX;
}

let lastEvent = 0;

function onMouseWheel(e)
{
    if (Date.now() - lastEvent < 10) return;
    lastEvent = Date.now();

    deltaOrig.set(e.wheelDelta || e.deltaY);

    if (e.deltaY)
    {
        let d = normalizeWheel(e);
        if (inSimpleIncrement.get())
        {
            if (d > 0)d = speed.get();
            else d = -speed.get();
        }
        else d *= 0.01 * speed.get();

        delta.set(0);
        delta.set(d);
    }

    if (e.deltaX)
    {
        let dX = normalizeWheelX(e);
        dX *= 0.01 * speed.get();

        deltaX.set(0);
        deltaX.set(dX);
    }

    if (preventScroll.get()) e.preventDefault();
    trigger.trigger();
}

function updateArea()
{
    removeListener();

    if (area.get() == "Document") listenerElement = document;
    if (area.get() == "Parent") listenerElement = cgl.canvas.parentElement;
    else listenerElement = cgl.canvas;

    if (active.get())addListener();
}

function addListener()
{
    if (!listenerElement)updateArea();
    listenerElement.addEventListener("wheel", onMouseWheel, { "passive": false });
}

function removeListener()
{
    if (listenerElement) listenerElement.removeEventListener("wheel", onMouseWheel);
}

active.onChange = function ()
{
    updateArea();
};


};

Ops.Devices.Mouse.MouseWheel_v2.prototype = new CABLES.Op();
CABLES.OPS["7b9626db-536b-4bb4-85c3-95401bc60d1b"]={f:Ops.Devices.Mouse.MouseWheel_v2,objName:"Ops.Devices.Mouse.MouseWheel_v2"};




// **************************************************************
// 
// Ops.Math.DeltaSum
// 
// **************************************************************

Ops.Math.DeltaSum = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    inVal = op.inValue("Delta Value"),
    defVal = op.inValue("Default Value", 0),
    inMul = op.inValue("Multiply", 1),
    inReset = op.inTriggerButton("Reset"),
    inLimit = op.inValueBool("Limit", false),
    inMin = op.inValue("Min", 0),
    inMax = op.inValue("Max", 100),
    inRubber = op.inValue("Rubberband", 0),
    outVal = op.outNumber("Absolute Value");

inVal.changeAlways = true;

op.setPortGroup("Limit", [inLimit, inMin, inMax, inRubber]);

let value = 0;
let lastEvent = CABLES.now();
let rubTimeout = null;

inLimit.onChange = updateLimit;
defVal.onChange =
    inReset.onTriggered = resetValue;

inMax.onChange =
    inMin.onChange = updateValue;

updateLimit();

function resetValue()
{
    let v = defVal.get();

    if (inLimit.get())
    {
        v = Math.max(inMin.get(), v);
        v = Math.min(inMax.get(), v);
    }

    value = v;
    outVal.set(value);
}

function updateLimit()
{
    inMin.setUiAttribs({ "greyout": !inLimit.get() });
    inMax.setUiAttribs({ "greyout": !inLimit.get() });
    inRubber.setUiAttribs({ "greyout": !inLimit.get() });

    updateValue();
}

function releaseRubberband()
{
    const min = inMin.get();
    const max = inMax.get();

    if (value < min) value = min;
    if (value > max) value = max;

    outVal.set(value);
}

function updateValue()
{
    if (inLimit.get())
    {
        const min = inMin.get();
        const max = inMax.get();
        const rubber = inRubber.get();
        const minr = inMin.get() - rubber;
        const maxr = inMax.get() + rubber;

        if (value < minr) value = minr;
        if (value > maxr) value = maxr;

        if (rubber !== 0.0)
        {
            clearTimeout(rubTimeout);
            rubTimeout = setTimeout(releaseRubberband.bind(this), 300);
        }
    }

    outVal.set(value);
}

inVal.onChange = function ()
{
    let v = inVal.get();

    const rubber = inRubber.get();

    if (rubber !== 0.0)
    {
        const min = inMin.get();
        const max = inMax.get();
        const minr = inMin.get() - rubber;
        const maxr = inMax.get() + rubber;

        if (value < min)
        {
            const aa = Math.abs(value - minr) / rubber;
            v *= (aa * aa);
        }
        if (value > max)
        {
            const aa = Math.abs(maxr - value) / rubber;
            v *= (aa * aa);
        }
    }

    lastEvent = CABLES.now();
    value += v * inMul.get();
    updateValue();
};


};

Ops.Math.DeltaSum.prototype = new CABLES.Op();
CABLES.OPS["d9d4b3db-c24b-48da-b798-9e6230d861f7"]={f:Ops.Math.DeltaSum,objName:"Ops.Math.DeltaSum"};




// **************************************************************
// 
// Ops.Anim.Smooth
// 
// **************************************************************

Ops.Anim.Smooth = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exec = op.inTrigger("Update"),
    inMode = op.inBool("Separate inc/dec", false),
    inVal = op.inValue("Value"),
    next = op.outTrigger("Next"),
    inDivisorUp = op.inValue("Inc factor", 4),
    inDivisorDown = op.inValue("Dec factor", 4),
    result = op.outNumber("Result", 0);

let val = 0;
let goal = 0;
let oldVal = 0;
let lastTrigger = 0;

op.toWorkPortsNeedToBeLinked(exec);

let divisorUp;
let divisorDown;
let divisor = 4;
let finished = true;

let selectIndex = 0;
const MODE_SINGLE = 0;
const MODE_UP_DOWN = 1;

onFilterChange();
getDivisors();

inMode.setUiAttribs({ "hidePort": true });

inDivisorUp.onChange = inDivisorDown.onChange = getDivisors;
inMode.onChange = onFilterChange;
update();

function onFilterChange()
{
    const selectedMode = inMode.get();
    if (!selectedMode) selectIndex = MODE_SINGLE;
    else selectIndex = MODE_UP_DOWN;

    if (selectIndex == MODE_SINGLE)
    {
        inDivisorDown.setUiAttribs({ "greyout": true });
        inDivisorUp.setUiAttribs({ "title": "Inc/Dec factor" });
    }
    else if (selectIndex == MODE_UP_DOWN)
    {
        inDivisorDown.setUiAttribs({ "greyout": false });
        inDivisorUp.setUiAttribs({ "title": "Inc factor" });
    }

    getDivisors();
    update();
}

function getDivisors()
{
    if (selectIndex == MODE_SINGLE)
    {
        divisorUp = inDivisorUp.get();
        divisorDown = inDivisorUp.get();
    }
    else if (selectIndex == MODE_UP_DOWN)
    {
        divisorUp = inDivisorUp.get();
        divisorDown = inDivisorDown.get();
    }

    if (divisorUp <= 0.2 || divisorUp != divisorUp)divisorUp = 0.2;
    if (divisorDown <= 0.2 || divisorDown != divisorDown)divisorDown = 0.2;
}

inVal.onChange = function ()
{
    finished = false;
    let oldGoal = goal;
    goal = inVal.get();
};

inDivisorUp.onChange = function ()
{
    getDivisors();
};

function update()
{
    let tm = 1;
    if (performance.now() - lastTrigger > 500 || lastTrigger === 0) val = inVal.get() || 0;
    else tm = (performance.now() - lastTrigger) / (performance.now() - lastTrigger);
    lastTrigger = performance.now();

    if (val != val)val = 0;

    if (divisor <= 0)divisor = 0.0001;

    const diff = goal - val;

    if (diff >= 0) val += (diff) / (divisorDown * tm);
    else val += (diff) / (divisorUp * tm);

    if (Math.abs(diff) < 0.00001)val = goal;

    if (divisor != divisor)val = 0;
    if (val != val || val == -Infinity || val == Infinity)val = inVal.get();

    if (oldVal != val)
    {
        result.set(val);
        oldVal = val;
    }

    if (val == goal && !finished)
    {
        finished = true;
        result.set(val);
    }

    next.trigger();
}

exec.onTriggered = function ()
{
    update();
};


};

Ops.Anim.Smooth.prototype = new CABLES.Op();
CABLES.OPS["5677b5b5-753a-4fbf-9e91-64c81ec68a2f"]={f:Ops.Anim.Smooth,objName:"Ops.Anim.Smooth"};




// **************************************************************
// 
// Ops.Math.Clamp
// 
// **************************************************************

Ops.Math.Clamp = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    val = op.inValueFloat("val", 0.5),
    min = op.inValueFloat("min", 0),
    max = op.inValueFloat("max", 1),
    ignore = op.inValueBool("ignore outside values"),
    result = op.outNumber("result");

val.onChange = min.onChange = max.onChange = clamp;

function clamp()
{
    if (ignore.get())
    {
        if (val.get() > max.get()) return;
        if (val.get() < min.get()) return;
    }
    result.set(Math.min(Math.max(val.get(), min.get()), max.get()));
}


};

Ops.Math.Clamp.prototype = new CABLES.Op();
CABLES.OPS["cda1a98e-5e16-40bd-9b18-a67e9eaad5a1"]={f:Ops.Math.Clamp,objName:"Ops.Math.Clamp"};




// **************************************************************
// 
// Ops.Math.Sum
// 
// **************************************************************

Ops.Math.Sum = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    number1 = op.inValueFloat("number1", 1),
    number2 = op.inValueFloat("number2", 1),
    result = op.outNumber("result");

op.setTitle("+");

number1.onChange =
number2.onChange = exec;
exec();

function exec()
{
    const v = number1.get() + number2.get();
    if (!isNaN(v))
        result.set(v);
}


};

Ops.Math.Sum.prototype = new CABLES.Op();
CABLES.OPS["c8fb181e-0b03-4b41-9e55-06b6267bc634"]={f:Ops.Math.Sum,objName:"Ops.Math.Sum"};




// **************************************************************
// 
// Ops.Gl.Matrix.TransformView
// 
// **************************************************************

Ops.Gl.Matrix.TransformView = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    render = op.inTrigger("render"),
    posX = op.inValueFloat("posX"),
    posY = op.inValueFloat("posY"),
    posZ = op.inValueFloat("posZ"),
    scale = op.inValueFloat("scale"),
    rotX = op.inValueFloat("rotX"),
    rotY = op.inValueFloat("rotY"),
    rotZ = op.inValueFloat("rotZ"),
    trigger = op.outTrigger("trigger");

op.setPortGroup("Position", [posX, posY, posZ]);
op.setPortGroup("Scale", [scale]);
op.setPortGroup("Rotation", [rotX, rotZ, rotY]);

const vPos = vec3.create();
const vScale = vec3.create();
const transMatrix = mat4.create();
mat4.identity(transMatrix);

let doScale = false;
let doTranslate = false;

let translationChanged = true;
let didScaleChanged = true;
let didRotChanged = true;

render.onTriggered = function ()
{
    const cg = op.patch.cg;

    let updateMatrix = false;
    if (translationChanged)
    {
        updateTranslation();
        updateMatrix = true;
    }
    if (didScaleChanged)
    {
        updateScale();
        updateMatrix = true;
    }
    if (didRotChanged)
    {
        updateMatrix = true;
    }
    if (updateMatrix)doUpdateMatrix();

    cg.pushViewMatrix();
    mat4.multiply(cg.vMatrix, cg.vMatrix, transMatrix);

    trigger.trigger();
    cg.popViewMatrix();

    if (op.isCurrentUiOp())
        gui.setTransformGizmo(
            {
                "posX": posX,
                "posY": posY,
                "posZ": posZ,
            });
};

op.transform3d = function ()
{
    return {
        "pos": [posX, posY, posZ]
    };
};

function doUpdateMatrix()
{
    mat4.identity(transMatrix);
    if (doTranslate)mat4.translate(transMatrix, transMatrix, vPos);

    if (rotX.get() !== 0)mat4.rotateX(transMatrix, transMatrix, rotX.get() * CGL.DEG2RAD);
    if (rotY.get() !== 0)mat4.rotateY(transMatrix, transMatrix, rotY.get() * CGL.DEG2RAD);
    if (rotZ.get() !== 0)mat4.rotateZ(transMatrix, transMatrix, rotZ.get() * CGL.DEG2RAD);

    if (doScale)mat4.scale(transMatrix, transMatrix, vScale);
    rotChanged = false;
}

function updateTranslation()
{
    doTranslate = false;
    if (posX.get() !== 0.0 || posY.get() !== 0.0 || posZ.get() !== 0.0) doTranslate = true;
    vec3.set(vPos, posX.get(), posY.get(), posZ.get());
    translationChanged = false;
}

function updateScale()
{
    doScale = false;
    if (scale.get() !== 0.0)doScale = true;
    vec3.set(vScale, scale.get(), scale.get(), scale.get());
    scaleChanged = false;
}

function translateChanged()
{
    translationChanged = true;
}

function scaleChanged()
{
    didScaleChanged = true;
}

function rotChanged()
{
    didRotChanged = true;
}

rotX.onChange =
rotY.onChange =
rotZ.onChange = rotChanged;

scale.onChange = scaleChanged;

posX.onChange =
posY.onChange =
posZ.onChange = translateChanged;

rotX.set(0.0);
rotY.set(0.0);
rotZ.set(0.0);

scale.set(1.0);

posX.set(0.0);
posY.set(0.0);
posZ.set(0.0);

doUpdateMatrix();


};

Ops.Gl.Matrix.TransformView.prototype = new CABLES.Op();
CABLES.OPS["0b3e04f7-323e-4ac8-8a22-a21e2f36e0e9"]={f:Ops.Gl.Matrix.TransformView,objName:"Ops.Gl.Matrix.TransformView"};




// **************************************************************
// 
// Ops.Color.ColorPalettes
// 
// **************************************************************

Ops.Color.ColorPalettes = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const index = op.inValueInt("Index", 0);
const textureOut = op.outTexture("Texture");
const inLinear = op.inValueBool("Smooth");
const arrOut = op.outArray("Color Array");

let canvas = document.createElement("canvas");
canvas.id = "canvas_" + CABLES.generateUUID();
canvas.width = 5;
canvas.height = 8;
canvas.style.display = "none";

let body = document.getElementsByTagName("body")[0];
body.appendChild(canvas);
let ctx = canvas.getContext("2d");

index.onChange =
inLinear.onChange = buildTextureLater;

let arr = [];
arr.length = 5 * 3;
let lastFilter = null;

buildTextureLater();

function hexToR(h)
{
    return parseInt((cutHex(h)).substring(0, 2), 16);
}

function hexToG(h)
{
    return parseInt((cutHex(h)).substring(2, 4), 16);
}

function hexToB(h)
{
    return parseInt((cutHex(h)).substring(4, 6), 16);
}

function cutHex(h)
{
    return (h.charAt(0) == "#") ? h.substring(1, 7) : h;
}

function buildTextureLater()
{
    op.patch.cgl.addNextFrameOnceCallback(buildTexture);
}

function buildTexture()
{
    let ind = Math.round(index.get()) * 5;
    if (ind >= colors.length - 5)ind = 0;
    if (ind < 0)ind = 0;
    if (ind != ind)ind = 0;

    for (let i = 0; i < 5; i++)
    {
        let r = hexToR(colors[ind + i]);
        let g = hexToG(colors[ind + i]);
        let b = hexToB(colors[ind + i]);

        arr[i * 3 + 0] = r / 255;
        arr[i * 3 + 1] = g / 255;
        arr[i * 3 + 2] = b / 255;

        ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
        ctx.fillRect(
            canvas.width / 5 * i,
            0,
            canvas.width / 5,
            canvas.height
        );
    }

    let filter = CGL.Texture.FILTER_NEAREST;
    if (inLinear.get())filter = CGL.Texture.FILTER_LINEAR;

    if (lastFilter == filter && textureOut.get()) textureOut.get().initTexture(canvas, filter);
    else textureOut.set(new CGL.Texture.createFromImage(op.patch.cgl, canvas, { "filter": filter }));

    arrOut.set(null);
    arrOut.set(arr);
    textureOut.get().unpackAlpha = false;
    lastFilter = filter;
}

op.onDelete = function ()
{
    canvas.remove();
};

const colors = [
    "#E6E2AF", "#A7A37E", "#EFECCA", "#046380", "002F2F",
    "#468966", "#FFF0A5", "#FFB03B", "#B64926", "8E2800",
    "#FCFFF5", "#D1DBBD", "#91AA9D", "#3E606F", "193441",
    "#FF6138", "#FFFF9D", "#BEEB9F", "#79BD8F", "00A388",
    "#105B63", "#FFFAD5", "#FFD34E", "#DB9E36", "BD4932",
    "#225378", "#1695A3", "#ACF0F2", "#F3FFE2", "EB7F00",
    "#2C3E50", "#E74C3C", "#ECF0F1", "#3498DB", "2980B9",
    "#000000", "#263248", "#7E8AA2", "#FFFFFF", "FF9800",
    "#004358", "#1F8A70", "#BEDB39", "#FFE11A", "FD7400",
    "#DC3522", "#D9CB9E", "#374140", "#2A2C2B", "1E1E20",
    "#7D8A2E", "#C9D787", "#FFFFFF", "#FFC0A9", "FF8598",
    "#B9121B", "#4C1B1B", "#F6E497", "#FCFAE1", "BD8D46",
    "#2E0927", "#D90000", "#FF2D00", "#FF8C00", "04756F",
    "#595241", "#B8AE9C", "#FFFFFF", "#ACCFCC", "8A0917",
    "#10222B", "#95AB63", "#BDD684", "#E2F0D6", "F6FFE0",
    "#F6F792", "#333745", "#77C4D3", "#DAEDE2", "EA2E49",
    "#703030", "#2F343B", "#7E827A", "#E3CDA4", "C77966",
    "#2F2933", "#01A2A6", "#29D9C2", "#BDF271", "FFFFA6",
    "#D8CAA8", "#5C832F", "#284907", "#382513", "363942",
    "#FFF8E3", "#CCCC9F", "#33332D", "#9FB4CC", "DB4105",
    "#85DB18", "#CDE855", "#F5F6D4", "#A7C520", "493F0B",
    "#04BFBF", "#CAFCD8", "#F7E967", "#A9CF54", "588F27",
    "#292929", "#5B7876", "#8F9E8B", "#F2E6B6", "412A22",
    "#332532", "#644D52", "#F77A52", "#FF974F", "A49A87",
    "#405952", "#9C9B7A", "#FFD393", "#FF974F", "F54F29",
    "#2B3A42", "#3F5765", "#BDD4DE", "#EFEFEF", "FF530D",
    "#962D3E", "#343642", "#979C9C", "#F2EBC7", "348899",
    "#96CA2D", "#B5E655", "#EDF7F2", "#4BB5C1", "7FC6BC",
    "#1C1D21", "#31353D", "#445878", "#92CDCF", "EEEFF7",
    "#3E454C", "#2185C5", "#7ECEFD", "#FFF6E5", "FF7F66",
    "#00585F", "#009393", "#FFFCC4", "#F0EDBB", "FF3800",
    "#B4AF91", "#787746", "#40411E", "#32331D", "C03000",
    "#63A69F", "#F2E1AC", "#F2836B", "#F2594B", "CD2C24",
    "#88A825", "#35203B", "#911146", "#CF4A30", "ED8C2B",
    "#F2385A", "#F5A503", "#E9F1DF", "#4AD9D9", "36B1BF",
    "#CFC291", "#FFF6C5", "#A1E8D9", "#FF712C", "695D46",
    "#FF5335", "#B39C85", "#306E73", "#3B424D", "1D181F",
    "#000000", "#333333", "#FF358B", "#01B0F0", "AEEE00",
    "#E8E595", "#D0A825", "#40627C", "#26393D", "FFFAE4",
    "#E7E8D1", "#D3CEAA", "#FBF7E4", "#424242", "8E001C",
    "#354242", "#ACEBAE", "#FFFF9D", "#C9DE55", "7D9100",
    "#2F2933", "#01A2A6", "#29D9C2", "#BDF271", "FFFFA6",
    "#DDDCC5", "#958976", "#611427", "#1D2326", "6A6A61",
    "#6C6E58", "#3E423A", "#417378", "#A4CFBE", "F4F7D9",
    "#E1E6FA", "#C4D7ED", "#ABC8E2", "#375D81", "183152",
    "#6B0C22", "#D9042B", "#F4CB89", "#588C8C", "011C26",
    "#304269", "#91BED4", "#D9E8F5", "#FFFFFF", "F26101",
    "#96CEB4", "#FFEEAD", "#FF6F69", "#FFCC5C", "AAD8B0",
    "#B0CC99", "#677E52", "#B7CA79", "#F6E8B1", "89725B",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF5A49",
    "#16193B", "#35478C", "#4E7AC7", "#7FB2F0", "ADD5F7",
    "#00261C", "#044D29", "#168039", "#45BF55", "96ED89",
    "#36362C", "#5D917D", "#A8AD80", "#E6D4A7", "825534",
    "#F9E4AD", "#E6B098", "#CC4452", "#723147", "31152B",
    "#2C3E50", "#FC4349", "#D7DADB", "#6DBCDB", "FFFFFF",
    "#002635", "#013440", "#AB1A25", "#D97925", "EFE7BE",
    "#FF8000", "#FFD933", "#CCCC52", "#8FB359", "192B33",
    "#272F32", "#9DBDC6", "#FFFFFF", "#FF3D2E", "DAEAEF",
    "#B8ECD7", "#083643", "#B1E001", "#CEF09D", "476C5E",
    "#002F32", "#42826C", "#A5C77F", "#FFC861", "C84663",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#F3B562", "F06060",
    "#5A1F00", "#D1570D", "#FDE792", "#477725", "A9CC66",
    "#5E0042", "#2C2233", "#005869", "#00856A", "8DB500",
    "#52656B", "#FF3B77", "#CDFF00", "#FFFFFF", "B8B89F",
    "#801637", "#047878", "#FFB733", "#F57336", "C22121",
    "#730046", "#BFBB11", "#FFC200", "#E88801", "C93C00",
    "#24221F", "#363F45", "#4B5F6D", "#5E7C88", "FEB41C",
    "#E64661", "#FFA644", "#998A2F", "#2C594F", "002D40",
    "#C24704", "#D9CC3C", "#FFEB79", "#A0E0A9", "00ADA7",
    "#484A47", "#C1CE96", "#ECEBF0", "#687D77", "353129",
    "#588C7E", "#F2E394", "#F2AE72", "#D96459", "8C4646",
    "#BAB293", "#A39770", "#EFE4BD", "#A32500", "2B2922",
    "#6A7059", "#FDEEA7", "#9BCC93", "#1A9481", "003D5C",
    "#174C4F", "#207178", "#FF9666", "#FFE184", "F5E9BE",
    "#D5FBFF", "#9FBCBF", "#647678", "#2F3738", "59D8E6",
    "#DB5800", "#FF9000", "#F0C600", "#8EA106", "59631E",
    "#450003", "#5C0002", "#94090D", "#D40D12", "FF1D23",
    "#211426", "#413659", "#656F8C", "#9BBFAB", "F2EFDF",
    "#EA6045", "#F8CA4D", "#F5E5C0", "#3F5666", "2F3440",
    "#F2F2F2", "#C6E070", "#91C46C", "#287D7D", "1C344D",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF5A49",
    "#705B35", "#C7B07B", "#E8D9AC", "#FFF6D9", "570026",
    "#F7F2B2", "#ADCF4F", "#84815B", "#4A1A2C", "8E3557",
    "#1A1F2B", "#30395C", "#4A6491", "#85A5CC", "D0E4F2",
    "#25064D", "#36175E", "#553285", "#7B52AB", "9768D1",
    "#004056", "#2C858D", "#74CEB7", "#C9FFD5", "FFFFCB",
    "#CFCA4C", "#FCF5BF", "#9FE5C2", "#5EB299", "745A33",
    "#776045", "#A8C545", "#DFD3B6", "#FFFFFF", "0092B2",
    "#CC3910", "#F1F2C0", "#CCC59E", "#8FA68E", "332F29",
    "#FF6600", "#C13B00", "#5E6D70", "#424E4F", "1B1D1E",
    "#690011", "#BF0426", "#CC2738", "#F2D99C", "E5B96F",
    "#1B1D26", "#425955", "#778C7A", "#F1F2D8", "BFBD9F",
    "#F6B1C3", "#F0788C", "#DE264C", "#BC0D35", "A20D1E",
    "#597533", "#332F28", "#61B594", "#E6DEA5", "C44E18",
    "#3FB8AF", "#7FC7AF", "#DAD8A7", "#FF9E9D", "FF3D7F",
    "#0F2D40", "#194759", "#296B73", "#3E8C84", "D8F2F0",
    "#42282F", "#74A588", "#D6CCAD", "#DC9C76", "D6655A",
    "#002A4A", "#17607D", "#FFF1CE", "#FF9311", "D64700",
    "#003056", "#04518C", "#00A1D9", "#47D9BF", "F2D03B",
    "#13140F", "#D4FF00", "#E4FFE6", "#68776C", "00D6DD",
    "#FCFAD0", "#A1A194", "#5B605F", "#464646", "A90641",
    "#289976", "#67CC8E", "#B1FF91", "#FFE877", "FF5600",
    "#302B1D", "#3F522B", "#737D26", "#A99E46", "D9CB84",
    "#56626B", "#6C9380", "#C0CA55", "#F07C6C", "AD5472",
    "#32450C", "#717400", "#DC8505", "#EC5519", "BE2805",
    "#C7B773", "#E3DB9A", "#F5FCD0", "#B1C2B3", "778691",
    "#E83A25", "#FFE9A3", "#98CC96", "#004563", "191B28",
    "#3399CC", "#67B8DE", "#91C9E8", "#B4DCED", "E8F8FF",
    "#1A212C", "#1D7872", "#71B095", "#DEDBA7", "D13F32",
    "#7D2A35", "#CC9258", "#917A56", "#B4BA6C", "FEFFC2",
    "#E7E9D1", "#D3D4AA", "#FCFAE6", "#444444", "901808",
    "#FFFFFF", "#AEAEAE", "#E64C66", "#2D3E50", "1BBC9B",
    "#E0FFB3", "#61C791", "#31797D", "#2A2F36", "F23C55",
    "#EB5937", "#1C1919", "#403D3C", "#456F74", "D3CBBD",
    "#E6DD00", "#8CB302", "#008C74", "#004C66", "332B40",
    "#14A697", "#F2C12E", "#F29D35", "#F27649", "F25252",
    "#261822", "#40152A", "#731630", "#CC1E2C", "FF5434",
    "#261F27", "#FEE169", "#CDD452", "#F9722E", "C9313D",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#F3B562", "F06060",
    "#2F3837", "#C5C7B6", "#FFF8D3", "#4C493E", "222028",
    "#E3CBAC", "#9C9985", "#C46D3B", "#788880", "324654",
    "#3F0B1B", "#7A1631", "#CF423C", "#FC7D49", "FFD462",
    "#14212B", "#293845", "#4F6373", "#8F8164", "D9D7AC",
    "#98A89E", "#BAC0AC", "#FAFAC6", "#FF4411", "D40015",
    "#FEFFFF", "#3C3F36", "#9FB03E", "#EBE9DC", "72918B",
    "#CC6B32", "#FFAB48", "#FFE7AD", "#A7C9AE", "888A63",
    "#262526", "#404040", "#8C8979", "#F2F2F2", "F60A20",
    "#00305A", "#004B8D", "#0074D9", "#4192D9", "7ABAF2",
    "#0C273D", "#54D0ED", "#FFFEF1", "#70B85D", "2C5E2E",
    "#4C1B33", "#EFE672", "#98A942", "#2D6960", "141D14",
    "#2F3540", "#666A73", "#F2EDE4", "#D9D1C7", "8C8681",
    "#0D1F30", "#3B6670", "#8BADA3", "#F0E3C0", "DB6C0F",
    "#FFBC67", "#DA727E", "#AC6C82", "#685C79", "455C7B",
    "#092140", "#024959", "#F2C777", "#F24738", "BF2A2A",
    "#133463", "#365FB7", "#799AE0", "#F4EFDC", "BA9B65",
    "#C4D4CB", "#55665E", "#30282A", "#542733", "E84167",
    "#CDDEC6", "#4DAAAB", "#1E4F6A", "#2A423C", "93A189",
    "#EF5411", "#FA5B0F", "#FF6517", "#FF6D1F", "FF822E",
    "#41434A", "#6E9489", "#DEDCC3", "#F2F1E9", "877963",
    "#292929", "#2BBFBD", "#F2B33D", "#F29B30", "F22E2E",
    "#F2385A", "#F5A503", "#E9F1DF", "#56D9CD", "3AA1BF",
    "#D5F8B4", "#A6E3A8", "#8A9A85", "#7E566B", "422335",
    "#3CBAC8", "#93EDD4", "#F3F5C4", "#F9CB8F", "F19181",
    "#979926", "#38CCB5", "#EEFF8E", "#FFD767", "CC2A09",
    "#404040", "#024959", "#037E8C", "#F2EFDC", "F24C27",
    "#94B34D", "#D3FF82", "#363D52", "#121D2B", "111B1C",
    "#282E33", "#25373A", "#164852", "#495E67", "FF3838",
    "#313732", "#8AA8B0", "#DEDEDE", "#FFFFFF", "F26101",
    "#FFFFFF", "#E5E1D1", "#52616D", "#2C343B", "C44741",
    "#FFF6B8", "#ABCCA7", "#403529", "#7A5E2F", "A68236",
    "#4F1025", "#C5003E", "#D9FF5B", "#78AA00", "15362D",
    "#49404F", "#596166", "#D1FFCD", "#A9BD8B", "948A54",
    "#FF2151", "#FF7729", "#FFAD29", "#FFEBCA", "1AB58A",
    "#73603D", "#BF8A49", "#F2CA80", "#5E5A59", "0D0D0D",
    "#3D4C53", "#70B7BA", "#F1433F", "#E7E1D4", "FFFFFF",
    "#006D8D", "#008A6E", "#549E39", "#8AB833", "C0CF3A",
    "#BDDFB3", "#2BAA9C", "#2F2E2E", "#0F2625", "465F3F",
    "#F2F2F2", "#BF0404", "#8C0303", "#590202", "400101",
    "#76A19A", "#272123", "#A68D60", "#B0C5BB", "D9593D",
    "#0E3D59", "#88A61B", "#F29F05", "#F25C05", "D92525",
    "#C1E1ED", "#76C7C6", "#273D3B", "#131A19", "E35C14",
    "#2D112C", "#530031", "#820233", "#CA293E", "EF4339",
    "#AF7575", "#EFD8A1", "#BCD693", "#AFD7DB", "3D9CA8",
    "#D74B4B", "#DCDDD8", "#475F77", "#354B5E", "FFFFFF",
    "#FFF6C9", "#C8E8C7", "#A4DEAB", "#85CC9F", "499E8D",
    "#229396", "#8BA88F", "#C7C5A7", "#F0DFD0", "F23C3C",
    "#57385C", "#A75265", "#EC7263", "#FEBE7E", "FFEDBC",
    "#96526B", "#D17869", "#EBAD60", "#F5CF66", "8BAB8D",
    "#0D1C33", "#17373C", "#2B6832", "#4F9300", "A1D700",
    "#1B2B32", "#37646F", "#A3ABAF", "#E1E7E8", "B22E2F",
    "#C5D9B2", "#53A194", "#572C2C", "#3D2324", "695A3B",
    "#425957", "#81AC8B", "#F2E5A2", "#F89883", "D96666",
    "#002E40", "#2A5769", "#FFFFFF", "#FABD4A", "FA9600",
    "#FFFEFC", "#E2E3DF", "#515B5E", "#2E3233", "CAF200",
    "#FFF0A3", "#B8CC6E", "#4B6000", "#E4F8FF", "004460",
    "#3B596A", "#427676", "#3F9A82", "#A1CD73", "ECDB60",
    "#F2E6CE", "#8AB39F", "#606362", "#593325", "1D1D1F",
    "#212B40", "#C2E078", "#FFFFFF", "#BADCDD", "547B97",
    "#0B3C4D", "#0E5066", "#136480", "#127899", "1A8BB3",
    "#222130", "#464D57", "#D4E8D3", "#FFFCFB", "ED8917",
    "#B33600", "#FF8A00", "#FFC887", "#CC5400", "B31E00",
    "#012530", "#28544B", "#ACBD86", "#FFD6A0", "FF302C",
    "#2E95A3", "#50B8B4", "#C6FFFA", "#E2FFA8", "D6E055",
    "#112F41", "#068587", "#4FB99F", "#F2B134", "ED553B",
    "#202B30", "#4E7178", "#4FA9B8", "#74C0CF", "F1F7E2",
    "#302B2F", "#696153", "#FFA600", "#9BB58F", "FFD596",
    "#458C6B", "#F2D8A7", "#D9A86C", "#D94436", "A62424",
    "#22475E", "#75B08A", "#F0E797", "#FF9D84", "FF5460",
    "#FFAA5C", "#DA727E", "#AC6C82", "#685C79", "455C7B",
    "#686E75", "#9BAAC1", "#82787B", "#E4F1DB", "AAC19B",
    "#F0C755", "#E2AD3B", "#BF5C00", "#901811", "5C110F",
    "#FFFBDC", "#BFBCA5", "#7F7D6E", "#3F3E37", "E5E2C6",
    "#BEBEBE", "#F1E4D8", "#594735", "#94C7BA", "D8F1E4",
    "#1B1E26", "#F2EFBD", "#B6D051", "#70A99A", "2F6D7A",
    "#F7E4A2", "#A7BD5B", "#DC574E", "#8DC7B8", "ED9355",
    "#70E8CB", "#FFE9C7", "#FF5B5B", "#545454", "2D2D2F",
    "#17111A", "#321433", "#660C47", "#B33467", "CCBB51",
    "#2B2E2E", "#595855", "#A2ABA5", "#CAE6E8", "313F54",
    "#023B47", "#295E52", "#F2E085", "#FCAB55", "EE7F38",
    "#302C29", "#D1D1BC", "#A7C4BB", "#6C8C84", "466964",
    "#212629", "#067778", "#49B8A8", "#85EDB6", "D9E5CD",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF4949",
    "#2C3E50", "#FC4349", "#6DBCDB", "#D7DADB", "FFFFFF",
    "#35262D", "#FFFBFF", "#E8ECED", "#A4B7BB", "76A0B0",
    "#61E8D2", "#FCEEB9", "#302F25", "#704623", "BBE687",
    "#E1E6B9", "#C4D7A4", "#ABC8A4", "#375D3B", "183128",
    "#C98B2F", "#803C27", "#C56520", "#E1B41B", "807916",
    "#A3D9B0", "#93BF9E", "#F2F0D5", "#8C8474", "40362E",
    "#524656", "#CF4747", "#EA7A58", "#E4DCCB", "A6C4BC",
    "#5C2849", "#A73E5C", "#EC4863", "#FFDA66", "1FCECB",
    "#0EEAFF", "#15A9FA", "#1B76FF", "#1C3FFD", "2C1DFF",
    "#010000", "#393845", "#9B96A3", "#5C0009", "940315",
    "#468071", "#FFE87A", "#FFCA53", "#FF893B", "E62738",
    "#404040", "#024959", "#037E8C", "#F2EFDC", "F24C27",
    "#FF765E", "#C2AE8B", "#FCCF65", "#FFE5C6", "B7BDC4",
    "#003647", "#00717D", "#F2D8A7", "#A4A66A", "515932",
    "#FAFAC0", "#C4BE90", "#8C644C", "#594D37", "293033",
    "#2B3A42", "#3F5765", "#BDD4DE", "#EFEFEF", "E74C3C",
    "#3B3B3B", "#A8877E", "#FFA49D", "#FF7474", "FF476C",
    "#0A3A4A", "#196674", "#33A6B2", "#9AC836", "D0E64B",
    "#FFA340", "#38001C", "#571133", "#017A74", "00C2BA",
    "#DCEBDD", "#A0D5D6", "#789AA1", "#304345", "AD9A27",
    "#588C7E", "#F2E394", "#F2AE72", "#D96459", "8C4646",
    "#F0E6B1", "#B5D6AA", "#99A37A", "#70584B", "3D3536",
    "#2F400D", "#8CBF26", "#A8CA65", "#E8E5B0", "419184",
    "#010712", "#13171F", "#1C1F26", "#24262D", "961227",
    "#403F33", "#6E755F", "#AFC2AA", "#FFDEA1", "E64C10",
    "#C74029", "#FAE8CD", "#128085", "#385052", "F0AD44",
    "#CFF09E", "#A8DBA8", "#79BD9A", "#3B8686", "0B486B",
    "#E0401C", "#E6B051", "#272F30", "#F7EDB7", "9E2B20",
    "#FFE2C5", "#FFEEDD", "#FFDDAA", "#FFC484", "FFDD99",
    "#FFFFE4", "#F2E5BD", "#B9BF8E", "#A69F7C", "8C6865",
    "#5C8A2D", "#AFD687", "#FFFFFF", "#00C3A9", "008798",
    "#4F3130", "#FF1F3D", "#5BE3E3", "#FDFFF1", "8B9698",
    "#D23600", "#D95100", "#DE6D00", "#EE8900", "FCA600",
    "#FFFFFA", "#A1A194", "#5B605F", "#464646", "FF6600",
    "#F34A53", "#FAE3B4", "#AAC789", "#437356", "1E4147",
    "#2A7A8C", "#176273", "#063540", "#E6D9CF", "403D3A",
    "#21455B", "#567D8C", "#A59E8C", "#8C8372", "F2F2F2",
    "#012340", "#026873", "#83A603", "#BBBF45", "F2F0CE",
    "#FDFF98", "#A7DB9E", "#211426", "#6B073B", "DA8C25",
    "#002F36", "#142426", "#D1B748", "#EDDB43", "FFFD84",
    "#420000", "#600000", "#790000", "#931111", "BF1616",
    "#3C989E", "#5DB5A4", "#F4CDA5", "#F57A82", "ED5276",
    "#23A38F", "#B7C11E", "#EFF1C2", "#F0563D", "2E313D",
    "#F5ECD9", "#2BACB5", "#B4CCB9", "#E84D5B", "3B3B3B",
    "#A5EB3C", "#60C21E", "#159E31", "#53DB50", "C5FFCB",
    "#263138", "#406155", "#7C9C71", "#DBC297", "FF5755",
    "#0A111F", "#263248", "#7E8AA2", "#E3E3E3", "C73226",
    "#003B59", "#00996D", "#A5D900", "#F2E926", "FF930E",
    "#00A19A", "#04BF9D", "#F2E85C", "#F53D54", "404040",
    "#324152", "#47535E", "#796466", "#C1836A", "DEA677",
    "#036F73", "#84CDC2", "#FEF2D8", "#F18C79", "EF504F",
    "#174040", "#888C65", "#D9CA9C", "#D98162", "A65858",
    "#56797F", "#87A0A4", "#FCFBDC", "#F2DDB6", "A6937C",
    "#A8BAA9", "#FFF5CF", "#DBCDAD", "#B39C7D", "806854",
    "#60655F", "#AB9675", "#FFE0C9", "#D4CCBA", "CF8442",
    "#BDDFB3", "#009D57", "#2C372E", "#0F2925", "465F3F",
    "#3E3947", "#735360", "#D68684", "#F1B0B0", "EBD0C4",
    "#0A7B83", "#2AA876", "#FFD265", "#F19C65", "CE4D45",
    "#FFFFFF", "#F4921E", "#858585", "#C5D2DB", "3E6B85",
    "#11151E", "#212426", "#727564", "#B9AA81", "690C07",
    "#000000", "#910000", "#CBB370", "#FFFBF1", "21786C",
    "#F78F00", "#C43911", "#75003C", "#37154A", "0F2459",
    "#003354", "#91BED4", "#D9E8F5", "#FFFFFF", "F26101",
    "#3DA8A4", "#7ACCBE", "#FFFFF7", "#FF99A1", "FF5879",
    "#64C733", "#F0F0F0", "#3E879E", "#57524D", "36302B",
    "#343844", "#2AB69D", "#E65848", "#FDC536", "FCF2D7",
    "#E34517", "#F5FF53", "#B4E85E", "#00BD72", "0B4239",
    "#A84B3A", "#FF9F67", "#233138", "#FFF7F5", "4C646B",
    "#59535E", "#FAEEFF", "#F1BAF3", "#5D4970", "372049",
    "#FF6F22", "#D9984F", "#FFE8A9", "#3E4237", "32948A",
    "#5D7370", "#7FA6A1", "#B8D9B8", "#D6EDBD", "FFF5BC",
    "#FFBE00", "#FFDC00", "#FFD10F", "#FFDE20", "E8CA00",
    "#003840", "#005A5B", "#007369", "#008C72", "02A676",
    "#E1E6FA", "#C4D7ED", "#ABC8E2", "#375D81", "183152",
    "#BA2F1D", "#FFF8A4", "#F5E67F", "#264A59", "1E2C30",
    "#222526", "#FFBB6E", "#F28D00", "#D94F00", "80203B",
    "#EBD096", "#D1B882", "#5D8A66", "#1A6566", "21445B",
    "#F00807", "#5F6273", "#A4ABBF", "#CCC9D1", "E2E1E9",
    "#DFE0AF", "#A4BAA2", "#569492", "#41505E", "383245",
    "#152737", "#2B4E69", "#799AA5", "#FFFFF0", "682321",
    "#C44C51", "#FFB6B8", "#FFEFB6", "#A2B5BF", "5F8CA3",
    "#5ADED4", "#4DAAAB", "#26596A", "#163342", "6C98A1",
    "#FF5B2B", "#B1221C", "#34393E", "#8CC6D7", "FFDA8C",
    "#3D4D4D", "#99992E", "#E6E666", "#F2FFBF", "800033",
    "#242424", "#437346", "#97D95C", "#D9FF77", "E9EB9B",
    "#FFEBB0", "#FFB05A", "#F84322", "#C33A1A", "9F3818",
    "#4D2B2F", "#E57152", "#E8DE67", "#FFEFC3", "C0CCAB",
    "#A82221", "#DB5E31", "#EDA23E", "#F2CB67", "BFB840",
    "#3B3140", "#BFB8A3", "#F2E0C9", "#F2B9AC", "D97E7E",
    "#43464D", "#9197A6", "#D3DCF2", "#7690CF", "48577D",
    "#EFDFBB", "#9EBEA6", "#335D6A", "#D64F2A", "7A8A7F",
    "#000001", "#313634", "#C7CECF", "#5C0402", "941515",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF5A49",
    "#F5F4E1", "#D6C9B5", "#B4AA97", "#D44917", "82877A",
    "#19162B", "#1C425C", "#6ABDC4", "#F0E4C5", "D6C28F",
    "#00132B", "#7F9DB0", "#C5E2ED", "#FFFFFF", "F95900",
    "#1F3642", "#6D968D", "#B6CCB8", "#FFE2B3", "56493F",
    "#08A689", "#82BF56", "#C7D93D", "#E9F2A0", "F2F2F2",
    "#DE3961", "#A4E670", "#FFFFDC", "#B3EECC", "00ADA7",
    "#849972", "#D9D094", "#A6A23E", "#4F2F1D", "8F5145",
    "#F41C54", "#FF9F00", "#FBD506", "#A8BF12", "00AAB5",
    "#00585F", "#009393", "#F5F3DC", "#454445", "FF5828",
    "#FF6138", "#FFFF9D", "#BEEB9F", "#79BD8F", "00A388",
    "#140B04", "#332312", "#B59D75", "#E3D2B4", "FFF7EA",
    "#ED3B3B", "#171F26", "#77B59C", "#F2E7B1", "635656",
    "#46594B", "#A6977C", "#D9B384", "#734F30", "260B01",
    "#CCB8A3", "#FF8FB1", "#FFF5EA", "#4E382F", "B29882",
    "#B70000", "#FFFFFF", "#FFCA3D", "#94C4F4", "0092B3",
    "#053B44", "#06736C", "#A53539", "#B9543C", "EAD075",
    "#E8C1B9", "#FFB3AB", "#FFCAB8", "#E8B69C", "FFCEAB",
    "#E7F2DF", "#69043B", "#59023B", "#231E2D", "161726",
    "#E82B1E", "#E5DEAF", "#A0B688", "#557A66", "453625",
    "#F1E6D4", "#BA3D49", "#791F33", "#9F9694", "E3E1DC",
    "#CED59F", "#F1EDC0", "#B1BEA4", "#647168", "282828",
    "#2C3E50", "#E74C3C", "#ECF0F1", "#3498DB", "646464",
    "#DE7047", "#FFDE8D", "#FFFFFF", "#CDDE47", "528540",
    "#8EAB99", "#40232B", "#D95829", "#D97338", "DEC085",
    "#E9662C", "#EBAF3C", "#00AC65", "#068894", "2B2B2B",
    "#46483C", "#A0AA8F", "#EBE3CB", "#FFFFFF", "F26101",
    "#170F0E", "#290418", "#505217", "#FFD372", "FFF1AF",
    "#263545", "#C4273C", "#D7DADB", "#6DBCDB", "FFFFFF",
    "#DCFAC0", "#B1E1AE", "#85C79C", "#56AE8B", "00968B",
    "#075807", "#097609", "#70AF1A", "#B9D40B", "E5EB0B",
    "#521000", "#712800", "#744E1D", "#879666", "F1D98C",
    "#261F26", "#3F3B40", "#6C7367", "#BFBF8A", "F2E086",
    "#2C3E50", "#FC4349", "#D7DADB", "#6DBCDB", "FFFFFF",
    "#506D7D", "#94CCB9", "#FFECA7", "#FFB170", "F07D65",
    "#3F4036", "#8DA681", "#F2E1C2", "#BF2806", "8C1D04",
    "#990700", "#CC542E", "#FF964F", "#FFCB7C", "787730",
    "#195073", "#7F8C1F", "#EE913F", "#F2E5BD", "9FD7C7",
    "#1B3E59", "#F2F0F0", "#FFAC00", "#BF0404", "730202",
    "#EA6045", "#F8CA4D", "#F5E5C0", "#3F5666", "2F3440",
    "#F95759", "#FDA099", "#FFFFFF", "#D9F3CB", "8AC2B0",
    "#265573", "#386D73", "#81A68A", "#9FBF8F", "D4D9B0",
    "#E1DA36", "#FFEA1B", "#6FE4DA", "#1DB0BC", "007BBC",
    "#013859", "#185E65", "#F9CC7F", "#F15C25", "9E1617",
    "#36CC7C", "#D6FFBE", "#94D794", "#228765", "77A668",
    "#94201F", "#D4421F", "#478A80", "#D9E061", "F08835",
    "#F16233", "#00B5B5", "#F0F0F0", "#3E4651", "5C6D7E",
    "#2E806C", "#76CC99", "#E0FFED", "#FF5F3A", "D2413C",
    "#00393B", "#00766C", "#44A18E", "#E5EDB6", "F6695B",
    "#734854", "#F2F2E9", "#D9D7C5", "#A69580", "736766",
    "#03497E", "#0596D5", "#9DEBFC", "#8D7754", "FEB228",
    "#F0E14C", "#FFBB20", "#FA7B12", "#E85305", "59CC0D",
    "#FE4365", "#FC9D9A", "#F9CDAD", "#C8C8A9", "83AF9B",
    "#00557C", "#186D94", "#3488AD", "#81C1DC", "BBE5F3",
    "#DEE8D7", "#918773", "#420A1A", "#240001", "4D493A",
    "#FFFFFF", "#CAC535", "#97AF25", "#158471", "41342C",
    "#041F3D", "#0B2E41", "#165751", "#448C61", "9AC16D",
    "#FA8C01", "#FF6405", "#577700", "#082400", "A0A600",
    "#78C0F9", "#FFDDCE", "#FFFFFF", "#FFDBE6", "FE86A4",
    "#351330", "#CC2A41", "#E7CAA4", "#759A8A", "524549",
    "#02151A", "#043A47", "#087891", "#C8C8C8", "B31D14",
    "#F34A53", "#FAE3B4", "#AAC789", "#437356", "1E4147",
    "#58838C", "#DAD7C7", "#BF996B", "#BF5841", "A61C1C",
    "#556354", "#E68F0D", "#8C948A", "#495450", "42423F",
    "#323640", "#5B6470", "#8C94A1", "#BDC7D6", "DFE2FF",
    "#FF0000", "#FF950B", "#2FA88C", "#DEEB00", "4B2C04",
    "#0F3D48", "#174C5B", "#366774", "#ECECE7", "E96151",
    "#3DBB7E", "#A3CD39", "#FBAC1D", "#F96C1E", "EE4036",
    "#23363B", "#A44F3F", "#F8983D", "#8D9151", "BBC946",
    "#4B5657", "#969481", "#D2C9B0", "#F4E3C1", "B6B835",
    "#E8980C", "#B1F543", "#F2FF00", "#FF5E00", "59BBAB",
    "#849696", "#FEFFFB", "#232D33", "#17384D", "FF972C",
    "#555555", "#7BB38E", "#F4F1D7", "#F8AB65", "F15C4C",
    "#1D3C42", "#67BFAD", "#F2EC99", "#F2C48D", "F25050",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF4949",
    "#B8E1F2", "#249AA7", "#ABD25E", "#F8C830", "F1594A",
    "#FDEDD0", "#BCF1ED", "#FF634D", "#FD795B", "FFF0AA",
    "#FFFFFF", "#E5E1D1", "#52616D", "#2C343B", "C44741",
    "#FFFFF1", "#D5FF9B", "#8FB87F", "#5A7B6C", "374E5A",
    "#010340", "#0E1E8C", "#0003C7", "#1510F0", "1441F7",
    "#002A4A", "#17607D", "#FFF1CE", "#FF9311", "E33200",
    "#871E31", "#CCC097", "#9E9D7B", "#687061", "262626",
    "#F16663", "#F48D6C", "#F2E07B", "#8ABE9B", "4A6D8B",
    "#001F11", "#204709", "#0C8558", "#FFD96A", "FF4533",
    "#1D1626", "#F2E0BD", "#BFAA8F", "#8C786C", "594C4C",
    "#685D47", "#913420", "#1E2729", "#C1D9C5", "FEEFB1",
    "#1D7561", "#FC8448", "#FF4138", "#A8282B", "38141B",
    "#BF0633", "#FF484E", "#FF9273", "#D1D0B4", "E5ECED",
    "#8E9E63", "#E6DBB0", "#F5EED7", "#C4BCA0", "176573",
    "#665446", "#809994", "#AECCB6", "#DEF2C4", "E6683F",
    "#3D0D26", "#660A3E", "#891C56", "#B0276F", "C93482",
    "#082136", "#00294D", "#004B8D", "#0068C4", "2998FF",
    "#3C4631", "#9A746F", "#F8A2AB", "#F1C6B3", "EAE9C0",
    "#FF534E", "#FFD7AC", "#BED194", "#499989", "176785",
    "#006D80", "#BDA44D", "#3C2000", "#84CECC", "78A419",
    "#352C2B", "#3C555C", "#9E9657", "#FFEBCD", "CD5510",
    "#2C3E50", "#FC4349", "#6DBCDB", "#D7DADB", "FFFFFF",
    "#523631", "#D1BE91", "#605E3A", "#4D462F", "592F39",
    "#18293B", "#5B5A56", "#F2DEA0", "#D0B580", "FFFBFF",
    "#C8DBB6", "#ECEBB7", "#CCC68A", "#B8B165", "827A5D ",
    "#7DA88C", "#EBE9A0", "#BED24B", "#859132", "35323C",
    "#E8574C", "#F27B29", "#E6A51B", "#D9CC3C", "399977",
    "#324032", "#B7C22C", "#FFFFE1", "#22A8B5", "2A3F42",
    "#B3A589", "#FFB896", "#FFF9B1", "#9AB385", "11929E",
    "#272433", "#343F4F", "#3D6066", "#77994D", "B2D249",
    "#250701", "#6D4320", "#B0925F", "#E7DEC0", "82ABB8",
    "#023550", "#028A9E", "#04BFBF", "#EFEFEF", "FF530D",
    "#594732", "#40342A", "#7A422E", "#D4CA9A", "EDE5AE",
    "#013C4D", "#BA5B22", "#DB913C", "#F0B650", "FAD46B",
    "#143840", "#5C6B63", "#A69E89", "#E0C297", "D96523",
    "#3FB8AF", "#7FC7AF", "#DAD8A7", "#FFB38B", "FF3F34",
    "#CA3995", "#F58220", "#FFDF05", "#BED73D", "61BC46",
    "#FFE1D0", "#FFBFB4", "#FF837E", "#FF4242", "BF1616",
    "#C4EEFF", "#7BA32D", "#094201", "#A41717", "C48726",
    "#001325", "#187072", "#90BD90", "#D7D8A2", "F2E4C2",
    "#1A4F63", "#068587", "#6FB07F", "#FCB03C", "FC5B3F",
    "#97B350", "#333230", "#736D61", "#BAAB90", "FFE5BA",
    "#403D33", "#807966", "#CCC2A3", "#8C0000", "590000",
    "#5F8A42", "#86AD59", "#F6FAA1", "#F28410", "D66011",
    "#BF355D", "#ED8168", "#FAB66A", "#F2DC86", "83BFA1",
    "#E1F03E", "#FFBA14", "#DB3A0F", "#A1003D", "630024",
    "#212226", "#45433F", "#687067", "#BDBB99", "F0EAC3",
    "#FE4365", "#FC9D9A", "#F9CDAD", "#C8C8A9", "83AF9B",
    "#293B47", "#5F7A87", "#FFFFFF", "#CBFF48", "00ADA9",
    "#282A33", "#697371", "#FFE7A6", "#F5BA52", "FA8000",
    "#0C304A", "#2B79A1", "#F3F4F1", "#85A71E", "BFD841",
    "#008B83", "#4DAE83", "#A0AE79", "#FFE499", "FF665E",
    "#5D7359", "#E0D697", "#D6AA5C", "#8C5430", "661C0E",
    "#324452", "#97BDBF", "#F2DFBB", "#F28705", "BF3604",
    "#EEEFB9", "#6ACFAE", "#369C93", "#232928", "B03831",
    "#332F45", "#015770", "#2A8782", "#9FD6AE", "FFFED2",
    "#2B2830", "#5C504F", "#ABAB8E", "#D9D7A3", "C7BE88",
    "#DC941B", "#EDC266", "#B6952C", "#E1D3A6", "E9A119",
    "#00305A", "#00448D", "#0074D9", "#4192D9", "7ABAF2",
    "#344459", "#485F73", "#5DA6A6", "#A9D9CB", "F2EAD0",
    "#060719", "#4D1B2F", "#9E332E", "#EB6528", "FC9D1C",
    "#96CEB4", "#FFEEAD", "#FF6F69", "#FFCC5C", "AAD8B0",
    "#05F2F2", "#04BFBF", "#EEF1D9", "#A60201", "7E100E",
    "#E6F1F5", "#636769", "#AAB3B6", "#6E7476", "4B4E50",
    "#DA0734", "#F1A20D", "#4AABB1", "#FCF3E7", "3F1833",
    "#202D44", "#FC4349", "#6DBCDB", "#D7DADB", "FFFFFF",
    "#CC3B37", "#398899", "#FFFCE8", "#FF857F", "CCC1A3",
    "#5DBEA9", "#EFEDDF", "#EF7247", "#4E3F35", "D1CBBA",
    "#FFC62D", "#E49400", "#DD5200", "#EFE38A", "91B166",
    "#B67D14", "#F2921F", "#F0B23E", "#A62409", "441208",
    "#C71B1B", "#D6BA8A", "#017467", "#E08F23", "0B0D0C",
    "#474143", "#A69E9D", "#E7E2DA", "#FFFFFF", "E7E8E7",
    "#435772", "#2DA4A8", "#FEAA3A", "#FD6041", "CF2257",
    "#6DD19D", "#99E89D", "#D0E8A1", "#FFF9C0", "D40049",
    "#FAF1D5", "#DEC9AC", "#CCA18B", "#11282D", "A5C4BB",
    "#000000", "#141414", "#1C1919", "#1A1716", "24201F",
    "#D5D8DD", "#5CA2BE", "#135487", "#2A4353", "989DA4",
    "#73161E", "#BF0F30", "#BFB093", "#037F8C", "0A2140",
    "#195962", "#F56F6C", "#FFFFFF", "#252932", "191C21",
    "#F8EFB6", "#FEBAC5", "#6CD1EA", "#FACFD7", "C2EAE9",
    "#91D6BC", "#768C6A", "#755F31", "#B37215", "FFBA4B",
    "#F2E6BB", "#DD4225", "#202724", "#63BD99", "F8FDD8",
    "#762B1B", "#807227", "#CCBF7A", "#FFEF98", "60B0A1",
    "#707864", "#C1D74E", "#F5FF7C", "#DFE6B4", "A6B89C",
    "#FFF3D2", "#97B48F", "#E87657", "#FF9B6F", "E8D495",
    "#33262E", "#733230", "#CC5539", "#E6D27F", "86A677",
    "#122430", "#273E45", "#FFFCE2", "#EBD2B5", "E63531",
    "#30394F", "#FF434C", "#6ACEEB", "#EDE8DF", "FFFBED",
    "#0A3A4A", "#196A73", "#32A6A6", "#A1BF36", "C8D94A",
    "#FFF7CC", "#CCC28F", "#70995C", "#33664D", "142933",
    "#43464D", "#9197A6", "#D3DCF2", "#7690CF", "48577D",
    "#DFE0AF", "#A4BAA2", "#569492", "#41505E", "383245",
    "#B52841", "#FFC051", "#FF8939", "#E85F4D", "590051",
    "#473C35", "#A36D5C", "#9C968B", "#D9CEAD", "8A866A",
    "#DB4C39", "#2D3638", "#109489", "#44D487", "D0DB86",
    "#6F8787", "#AEC2AE", "#E6DFAE", "#B0B57B", "888F51",
    "#C8385A", "#FFCF48", "#ECEABE", "#1FCECB", "1CA9C9",
    "#42282E", "#75A48B", "#D9CFB0", "#DC9B74", "D6665A",
    "#362F2D", "#4C4C4C", "#94B73E", "#B5C0AF", "FAFDF2",
    "#98293A", "#B14A58", "#C86C6B", "#DE9D76", "EFC77F",
    "#C1D301", "#76AB01", "#0E6A00", "#083500", "042200",
    "#453F22", "#7A6B26", "#CCAD5C", "#A1191F", "4E1716",
    "#541E32", "#8E3557", "#88A33E", "#C2BD86", "F7F2B2",
    "#2B1B2E", "#54344D", "#FFFFD6", "#B89E95", "6E444F",
    "#6EC1A5", "#9FBEA6", "#F5D3A3", "#FF9F88", "FB7878",
    "#2F252C", "#D3CCB2", "#99AD93", "#6E6751", "5C3122",
    "#BE333F", "#F2E9CE", "#C8C5B1", "#939F88", "307360",
    "#F0F1F2", "#232625", "#647362", "#B3D929", "D2D9B8",
    "#FA2B31", "#FFBF1F", "#FFF146", "#ABE319", "00C481",
    "#09455C", "#527E7C", "#F5FFCC", "#E0EB6E", "C4D224",
    "#F2DA91", "#F2B950", "#F29D35", "#D96704", "BF4904",
    "#A2CFA5", "#E0E7AB", "#F5974E", "#E96B56", "D24344",
    "#150033", "#310D42", "#5C2445", "#AB6946", "FFCE4C",
    "#23A38F", "#B7C11E", "#EFF1C2", "#F0563D", "2E313D",
    "#FF2468", "#E0D4B1", "#FFFFE3", "#00A5A6", "005B63",
    "#65A683", "#218777", "#3F585F", "#47384D", "F53357",
    "#000623", "#28475C", "#4A6C74", "#8BA693", "F0E3C0",
    "#E65322", "#D19552", "#B8BF73", "#B6DB83", "FFF991",
    "#112F41", "#068587", "#6FB07F", "#FCB03C", "FC5B3F",
    "#C89B41", "#A16B2B", "#77312B", "#1C2331", "152C52",
    "#C24366", "#D9C099", "#FFF8D8", "#A8E0BA", "00ADA7",
    "#CC0000", "#006600", "#FFFFEC", "#9C9178", "6C644F",
    "#3D0319", "#720435", "#C1140E", "#FC5008", "32241B",
    "#CFC7A4", "#5A9E94", "#005275", "#002344", "A38650",
    "#FFEBC3", "#CC3A00", "#FF3600", "#FF851B", "800C00",
    "#EFC164", "#F3835D", "#F35955", "#286275", "00434C",
    "#E9F29D", "#B7C29D", "#878E8F", "#67617A", "51456B",
    "#445859", "#03A696", "#49C4BE", "#F1F2E4", "FF7746",
    "#FA726C", "#FFD794", "#BAD174", "#3BA686", "5F6F8C",
    "#4D2B1F", "#635D61", "#7992A2", "#97BFD5", "BFDCF5",
    "#CC4D00", "#E6CF73", "#668059", "#264D4D", "00CCB3",
    "#4385F5", "#DC4437", "#FCBE1F", "#109D59", "FFFFFF",
    "#271F2E", "#A4A680", "#F2EBC9", "#D9B166", "A66B38",
    "#0B2C3C", "#FF6666", "#DADFE1", "#FFFFFF", "444444",
    "#CFF09E", "#A8DBA8", "#79BD9A", "#3B8686", "0B486B",
    "#302B26", "#A6B827", "#EDE9DD", "#98D3D4", "594E7A",
    "#4B0505", "#720707", "#BFB694", "#004659", "00292B",
    "#B52C38", "#EBD1B0", "#536682", "#D9964B", "DE6846",
    "#F2F1DF", "#F2B705", "#F2C84B", "#BF820F", "734002",
    "#26140C", "#3D2216", "#784E3D", "#AB8574", "D6BCB1",
    "#26221D", "#8C2C0F", "#E6E5B8", "#BFB38D", "402D1F",
    "#1F8181", "#F2BC79", "#F28972", "#BF1B39", "730240",
    "#002635", "#013440", "#AB1A25", "#D97925", "EFE7BE",
    "#8EC447", "#FFFFFF", "#96D3D4", "#636466", "2D2D2E",
    "#2D1E1E", "#4B3C37", "#96A576", "#CDE196", "FFFFBE",
    "#F06060", "#FA987D", "#F7F2CB", "#72CCA7", "10A296",
    "#1D8281", "#44BF87", "#FBD258", "#F29A3F", "DB634F",
    "#DEDE91", "#EF9950", "#F34E52", "#C91452", "492449",
    "#6D8EAD", "#1F3447", "#1A0B07", "#362416", "CFCDB4",
    "#00CD73", "#008148", "#2D9668", "#3ECD8E", "004E2C",
    "#3D8080", "#628282", "#858383", "#A38282", "C28080",
    "#475159", "#839795", "#B2BDB7", "#CCC9C0", "F2F2F2",
    "#0E6870", "#C6B599", "#C65453", "#FFDDB4", "EDAA7D",
    "#CEF0B7", "#A8DBA8", "#79BD9A", "#3B8686", "0B486B",
    "#292C44", "#FF5349", "#F0F0F1", "#18CDCA", "4F80E1",
    "#272A2B", "#383737", "#473B39", "#692B28", "940500",
    "#D6C274", "#DB9E46", "#25706B", "#3D2423", "AB362E",
    "#FFA68F", "#FF4867", "#FFF9C8", "#B5EBB9", "18B29D",
    "#A1A16A", "#727D59", "#366353", "#133C40", "03212E",
    "#D45354", "#A9DC3A", "#2FCAD8", "#818B85", "CDCDC1",
    "#F14B6A", "#3D3C3E", "#22BDAF", "#BAD7D4", "F4F4F4",
    "#FFE2C5", "#FFEEDD", "#FFDDAA", "#FFC484", "FFDD99",
    "#9FFF4A", "#1ABF93", "#087363", "#004040", "2F1933",
    "#FFDB97", "#B28F4E", "#FFFDFB", "#466CB2", "97BBFF",
    "#991C00", "#E09A25", "#FFFCDB", "#008B83", "262B30",
    "#44281A", "#00ACAE", "#F5EFD5", "#F37606", "EE4717",
    "#FF5952", "#FCEEC9", "#96D6D9", "#4FAAC9", "176075",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#A5C88F", "EF847B",
    "#105F73", "#F7F3B2", "#C6CC33", "#F28322", "CC5404",
    "#137072", "#56B292", "#B7F5AB", "#FBFFC0", "BF223D",
    "#E3F23E", "#6C821C", "#A6A53F", "#E0E0AC", "33302E",
    "#00215E", "#003CAA", "#1967F7", "#5E4000", "AA7400",
    "#273A3D", "#54695C", "#AD9970", "#FFBF87", "FF8F60",
    "#FFAA00", "#C2B93E", "#808F5D", "#576157", "302F30",
    "#BE1405", "#F2DCAC", "#AABEAA", "#736E41", "413C2D",
    "#6B1229", "#C76A61", "#FAB99A", "#F7D9B5", "CCB1A7",
    "#2D9993", "#58B3A3", "#83BFA3", "#B0D9A8", "FFFCB6",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF5A49",
    "#F30B55", "#010326", "#012840", "#54717F", "F2E6CE",
    "#2A3411", "#73662C", "#BC9847", "#FFDFB2", "6B0031",
    "#637D74", "#403D3A", "#8C3B3B", "#AB6937", "D4A960",
    "#010A26", "#011640", "#B6D6F2", "#FFFFFF", "E83338",
    "#924847", "#EB986C", "#E4C678", "#9C7885", "372C2C",
    "#022440", "#3F95AA", "#4EC6DE", "#EAE2DF", "F7572F",
    "#2B1D2E", "#323657", "#076473", "#54B087", "D6F567",
    "#052229", "#004043", "#BCC373", "#E3FF55", "D0D90C",
    "#4C514A", "#907A62", "#879796", "#755854", "B09880",
    "#1D2939", "#1CAF9A", "#FFFFFF", "#EE4F4B", "D1DC48",
    "#004B67", "#41CCB4", "#FFEA95", "#FF7C5D", "C70151",
    "#C0272D", "#FCFBE7", "#9FD3DA", "#008C9A", "05484F",
    "#213130", "#FF5E3D", "#C9C83E", "#FDFFF1", "559398",
    "#B1E4FC", "#366D78", "#39D5F1", "#FFFFFF", "D9FF03",
    "#DECE6C", "#FCF9B6", "#BFE3B5", "#5D826E", "262E2B",
    "#520A17", "#668F91", "#F5E6AC", "#AB8E5B", "52301C",
    "#2D3032", "#DD5F18", "#FBA922", "#F7F7F7", "404333",
    "#0C2538", "#2B434F", "#638270", "#BCC98E", "EDE059",
    "#E85066", "#F28E76", "#E6CEB0", "#5A8C81", "382837",
    "#BF2633", "#A6242F", "#D9CEAD", "#C0B18F", "011C26",
    "#002A4A", "#17607D", "#FFF1CE", "#FF9311", "E33200",
    "#0A8B91", "#485956", "#C4B98F", "#FFF9BC", "EEDF2E",
    "#B89A7B", "#9BBAAC", "#F2D649", "#D95D50", "DBDBDB",
    "#BD7938", "#8D4421", "#643001", "#532700", "3A1C00",
    "#E1E6FA", "#C4D7ED", "#ABC8E2", "#375D81", "183152",
    "#2E4259", "#F7483B", "#ECF0F1", "#03C8FA", "737373",
    "#364656", "#5D6B74", "#94A4A5", "#F2F5E9", "FF8C31",
    "#3E5916", "#93A605", "#F28705", "#F25C05", "E5EFFA",
    "#248077", "#74AD8D", "#C82754", "#F7BB21", "F9E2B7",
    "#20736A", "#8BD9CA", "#B1D95B", "#93A651", "403E34",
    "#D74B4B", "#DCDDD8", "#475F77", "#354B5E", "FFFFFF",
    "#252F33", "#415C4F", "#869C80", "#93C2CC", "CEEAEE",
    "#012840", "#79C7D9", "#9BF2EA", "#497358", "9DBF8E",
    "#EE7E94", "#F8B4C4", "#C7CAC9", "#D8505C", "41424",
    "#282828", "#505050", "#FFFFFF", "#2DCEDB", "F20000",
    "#004358", "#1F8A70", "#BEDB39", "#FF5347", "FD7400",
    "#470C3B", "#802F56", "#C0576F", "#E38679", "FFBD83",
    "#573328", "#B05A3A", "#FF8548", "#29332E", "0F1B1C",
    "#461F2D", "#E1FFBB", "#BAD47F", "#849C23", "52533F",
    "#333A40", "#4C5E5E", "#ADD0E5", "#CDE4FF", "729EBF",
    "#DE5605", "#F7A035", "#B1DEB5", "#EFECCA", "65ABA6",
    "#76D6D2", "#F9E270", "#EF6F56", "#F4EED8", "596B56",
    "#403E3F", "#F2F2F2", "#D9D9D9", "#9DAABB", "8C8C8C",
    "#059E9A", "#F4F2ED", "#F5A243", "#DB3E3B", "585857",
    "#FFBF41", "#EE8943", "#C02221", "#FFF4D3", "249CA9",
    "#024E76", "#39A6B2", "#FCE138", "#F5B824", "F08106",
    "#FF0067", "#FF3D6A", "#E7FF04", "#9CFF00", "56FF00",
    "#003540", "#0D3F40", "#487360", "#8FA671", "F2D795",
    "#FF493C", "#FFFFFF", "#B3ECEF", "#31C4F5", "ADEB41",
    "#244358", "#4A8B87", "#7CBCAE", "#F0D4AF", "C5252B",
    "#EA5930", "#F8AF1E", "#F5E5C0", "#097380", "372560",
    "#A1DBB2", "#FEE5AD", "#FACA66", "#F7A541", "F45D4C",
    "#2C4A47", "#6C9A7F", "#BB523D", "#C89D11", "81810B",
    "#F0F1F2", "#232625", "#647362", "#FF5629", "D2D9B8",
    "#7C9B5F", "#B8D197", "#E3FFF3", "#9BDEC7", "568F84",
    "#E54E45", "#DBC390", "#F2F2EF", "#13A3A5", "403833",
    "#77A7FB", "#E57368", "#FBCB43", "#34B67A", "FFFFFF",
    "#001A2E", "#8F0000", "#FFFFFF", "#8A874B", "41594F",
    "#312F40", "#49A69C", "#EFEAC5", "#E89063", "BF5656",
    "#047C8C", "#018B8D", "#F3BF81", "#F49B78", "F1706D",
    "#00303E", "#7096AD", "#C1D1DE", "#FFF9EF", "EC4911",
    "#2D6891", "#70A0BF", "#F5EEDC", "#DC4C1A", "F0986C",
    "#040002", "#3D1309", "#E8B96A", "#BC5D15", "5C0F00",
    "#8B929C", "#5E6070", "#514454", "#3B313D", "FF2479",
    "#142D58", "#447F6E", "#E1B65B", "#C8782A", "9E3E17",
    "#22104D", "#2D1E5E", "#483A85", "#7067AB", "A49CFA",
    "#919C86", "#9E373E", "#2B2E36", "#D1B993", "C45A3B",
    "#332F45", "#015770", "#2A8782", "#9FD6AE", "FFFED2",
    "#37C78F", "#FEE293", "#FF4D38", "#CC2249", "380C2A",
    "#47282C", "#8C8468", "#C9B37F", "#DBDAB7", "C4C49C",
    "#14191A", "#2D2B21", "#A69055", "#CCB287", "FFB88C",
    "#F5E3CD", "#696158", "#B6A898", "#877D71", "504A43",
    "#005151", "#009393", "#F56200", "#454445", "969692",
    "#D95F47", "#FFF2C1", "#80A894", "#106153", "072C36",
    "#9E352C", "#E6E8A9", "#93C28C", "#2E5A5C", "2B2623",
    "#03013A", "#334A94", "#6B9EDF", "#83C3F2", "99E6FF",
    "#372A26", "#4D4D4D", "#6DA0A7", "#9ED5A8", "C7F5FF",
    "#03658C", "#022E40", "#F2B705", "#F28705", "F25C05",
    "#FF3B16", "#E87826", "#E8BA4A", "#80A272", "003045",
    "#00748E", "#E3DFBB", "#F4BA4D", "#E3753C", "DA3B3A",
    "#25401E", "#56732C", "#84A63C", "#B8D943", "EAF2AC",
    "#449BB5", "#043D5D", "#EB5055", "#68C39F", "FFFCF5",
    "#108F97", "#FF8B6B", "#FFE39F", "#16866D", "103636",
    "#1A4F63", "#068F86", "#6FD57F", "#FCB03C", "FC5B3F",
    "#381C19", "#472E29", "#948658", "#F0E99A", "362E29",
    "#D7E8F7", "#BBD0E3", "#9CB7CF", "#6A8BAB", "375D81",
    "#0F1C28", "#136972", "#67BFA7", "#F3CF5B", "F07444",
    "#FFFFFF", "#4EA9A0", "#969514", "#FE9C03", "FCDE8E",
    "#2F2D30", "#656566", "#65537A", "#51386E", "2A2333",
    "#4C2916", "#F05A28", "#FBAF3F", "#38B449", "FFFFFF",
    "#132537", "#006C80", "#EBCAB8", "#FE8315", "FA3113",
    "#ECEEE1", "#A8DACF", "#F05B4F", "#D8403A", "221E1F",
    "#00305A", "#004B8C", "#0074D9", "#4192D9", "7ABAF2",
    "#72CF3F", "#85FF00", "#23E000", "#2FB81B", "00FF1C",
    "#45CEEF", "#FFF5A5", "#FFD4DA", "#99D2E4", "D8CAB4",
    "#FF5B00", "#A1716C", "#728296", "#439AAB", "00CABD",
    "#EB6C2D", "#D9C8A2", "#939C80", "#496158", "232F38",
    "#D94214", "#FFF2C1", "#80A894", "#52736B", "093844",
    "#4D1B2F", "#9E332E", "#EB6528", "#FC9D1C", "FFCA50",
    "#FFEEB0", "#9AE8A4", "#C7C12D", "#F76245", "ED1C43",
    "#FFFAED", "#D4DBFF", "#879AC9", "#242942", "FF8800",
    "#022840", "#013440", "#517360", "#9DA67C", "F2DC99",
    "#331A0F", "#519994", "#BA4B3C", "#EEDDAA", "789F63",
    "#577867", "#EDCE82", "#D68644", "#AB3229", "662845",
    "#435A66", "#88A6AF", "#F5F2EB", "#D9CDB8", "424342",
    "#FF8840", "#958D4F", "#737B55", "#595540", "513E38",
    "#9D805A", "#EBC99D", "#FFE6C5", "#9DCEEA", "4B809E",
    "#272D40", "#364659", "#55736D", "#9DBF8E", "D0D991",
    "#23A38F", "#B7C11E", "#EFF1C2", "#F0563D", "2E313D",
    "#98C000", "#3D4C53", "#EA2E49", "#FFE11A", "0CDBE8",
    "#A20E30", "#E93C4F", "#DCDCD4", "#ADBCC3", "2D4255",
    "#1C2640", "#263357", "#384C80", "#4E6AB3", "5979CD",
    "#D94214", "#FFF2C1", "#80A894", "#52736B", "093844",
    "#3B596A", "#427676", "#3F9A82", "#A1CD73", "ECDB60",
    "#1E1E1F", "#424143", "#67666A", "#807F83", "CBC9CF",
    "#E04946", "#3BA686", "#B6D15D", "#FFD495", "FA847E",
    "#FFEBB0", "#FFB05A", "#F84322", "#C33A1A", "9F3818",
    "#FFA136", "#FF814A", "#E6635A", "#785D6B", "534557",
    "#CDCF91", "#EBEACC", "#D6D5B8", "#6D7D80", "41545E",
    "#011526", "#011C40", "#4E8DA6", "#F2EA79", "F2B33D",
    "#353230", "#3F4E51", "#7B8F70", "#99B2BE", "F6F4EA",
    "#063559", "#0D8C7F", "#8FBF4D", "#F2D13E", "D95929",
    "#158000", "#199900", "#20BF00", "#24D900", "29FF00",
    "#0B0D0E", "#137074", "#7EB7A3", "#F1DDBB", "EC6766",
    "#02151A", "#043A47", "#087891", "#C8C8C8", "B31D14",
    "#59361F", "#5C992E", "#A3CC52", "#E6E673", "FF5933",
    "#FE4365", "#FC9D9A", "#F9CDAD", "#C8C8A9", "83AF9B",
    "#4B1E18", "#F9E5C2", "#BBB082", "#829993", "4F5D4E",
    "#032843", "#1F595B", "#508C6D", "#71A670", "A6DB89",
    "#191724", "#4C4547", "#8C594E", "#D18952", "FDB157",
    "#191919", "#182828", "#60702D", "#AAB232", "E6FA87",
    "#212A3F", "#434F5B", "#F2F2F2", "#8AB839", "2E2E2E",
    "#004158", "#026675", "#038B8B", "#F1EEC9", "F09979",
    "#023059", "#3F7EA6", "#F2F2F2", "#D99E32", "BF5E0A",
    "#F21E52", "#FFFFFF", "#3D3B42", "#0C6F73", "63CFD4",
    "#452743", "#E7635E", "#F8E9A8", "#89E0AD", "00928C",
    "#FAAD63", "#D1714D", "#785E48", "#39403B", "3D1C24",
    "#4C0016", "#FFF7EB", "#DCCEA7", "#A17345", "104F53",
    "#BF2431", "#F24150", "#2A4557", "#3B848C", "EFF2E4",
    "#3B3013", "#8F6031", "#E88833", "#9C0C0A", "FDF3C1",
    "#1E2422", "#88BEB1", "#FF006D", "#DAFFFF", "718A94",
    "#F1F4F7", "#AF9F7B", "#775E43", "#40413C", "251C17",
    "#00182E", "#0C6BA1", "#D4D6D4", "#FFFDEB", "FF7500",
    "#FFAB4A", "#CCBAAB", "#1E2129", "#3D5E6E", "47A3A3",
    "#66B3A7", "#C0D4B6", "#EEF0BD", "#F0563D", "2C2F3B",
    "#332525", "#907465", "#EDC5B5", "#878C6D", "63674A",
    "#F04C16", "#DBDBD0", "#EDBD1F", "#4CB09C", "313B4A",
    "#2B211D", "#611C26", "#C5003E", "#8EB7A8", "F1E4B7",
    "#1A1F2B", "#30395C", "#4A6491", "#85A5CC", "D0E4F2",
    "#03497E", "#0596D5", "#9DEBFC", "#999999", "FE4B28",
    "#2F4159", "#465E73", "#88A649", "#F2ECE4", "D98841",
    "#323A46", "#22282F", "#EB4A33", "#FFFFFF", "E9F0F5",
    "#2C3E50", "#FC4349", "#6DBCDB", "#D7DADB", "FFFFFF",
    "#F29727", "#E05723", "#B0382F", "#982E4B", "713045",
    "#4D584A", "#465943", "#428552", "#3E754E", "4C694B",
    "#47191C", "#59574B", "#829690", "#B5B09A", "E1E3CB",
    "#1D5123", "#B1C661", "#FFDA68", "#FE9257", "F64448",
    "#59323C", "#260126", "#F2EEB3", "#BFAF80", "8C6954",
    "#4E0805", "#9E0522", "#FFF4D4", "#B8C591", "447622",
    "#424862", "#FB9A63", "#BFC4D5", "#F6FBF4", "FEBC98",
    "#FF2468", "#E0D4B1", "#FFFFE3", "#00A5A6", "005B63",
    "#1C2F40", "#4C6173", "#8094A6", "#D9D1BA", "F2E9D8",
    "#DFD7B7", "#EB7707", "#5C5445", "#3B2323", "9CBFC7",
    "#262E3B", "#9C8878", "#CFCAAA", "#FBF8FF", "992435",
    "#FFBC67", "#DA727E", "#AC6C82", "#685C79", "455C7B",
    "#404A69", "#516C8A", "#8AC0DE", "#FFFFFF", "FFAC00",
    "#485B61", "#4B8C74", "#74C476", "#A4E66D", "CFFC83",
    "#A31180", "#C42795", "#DE52B4", "#EA88CE", "FFBFE5",
    "#E64D2E", "#FFF5F1", "#7893AD", "#576B9C", "2D2A52",
    "#BF0436", "#8C0327", "#590219", "#F2CBA1", "8C674C",
    "#CF5B6F", "#FFF8C8", "#CAD9B1", "#8FB3A0", "648991",
    "#341D44", "#744D90", "#BB8CDD", "#3E4417", "88904D",
    "#00293E", "#003D4E", "#006269", "#00918F", "00BAB5",
    "#43212E", "#D9666F", "#F2D57E", "#A9A688", "516057",
    "#2A3B30", "#ABFFD1", "#EBFFF5", "#9DFEFF", "273B40",
    "#A63343", "#E65159", "#F5E9DB", "#F4F7CF", "BAD984",
    "#1BA68C", "#54BFAC", "#F2EDA7", "#F2E530", "D94625",
    "#1A2A40", "#3F7369", "#F2DEA0", "#CE5251", "EA895E",
    "#1E9382", "#70A758", "#EFF1C2", "#F0563D", "2E313D",
    "#A991E8", "#FFB4BB", "#ACF7FF", "#A2E891", "FFEDAE",
    "#225B66", "#17A3A5", "#8DBF67", "#FCCB5F", "FC6E59",
    "#282624", "#BFB7AA", "#403D39", "#807A71", "ABA398",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF4949",
    "#440008", "#605521", "#988432", "#D9A54E", "9E3711",
    "#649670", "#36291E", "#69AD6C", "#92E67C", "C5FF84",
    "#42342C", "#738076", "#B2B39B", "#DFE5E1", "294359",
    "#1A3838", "#3F7A51", "#82A352", "#D1C062", "FFBE59",
    "#7D8C22", "#B3BF67", "#F2E49B", "#D9DFF4", "6791BF",
    "#8A7D6D", "#2D2D38", "#E86E48", "#FFFFE8", "9CC9C9",
    "#CFC949", "#FFF5BF", "#A9E6C4", "#6AB39F", "665841",
    "#A1172D", "#FDFFBA", "#A7DB9E", "#275C57", "1F1B19",
    "#FF6C0D", "#F29E00", "#E6C10F", "#44996F", "216273",
    "#2C3E50", "#FA4248", "#D7DADB", "#6DBCDB", "FFFFFF",
    "#627369", "#99B397", "#E2F2C6", "#91CCAD", "376266",
    "#04496E", "#66CAFF", "#A3FC7E", "#70D44A", "2C6B0F",
    "#1BA68C", "#97BF3F", "#F2ECD8", "#F2B035", "F2522E",
    "#A2D9B1", "#7CBF9E", "#F2F1B9", "#8C8575", "193741",
    "#024959", "#037E8C", "#F2EFDC", "#E74C30", "363636",
    "#212625", "#9CA6A2", "#D0D9D6", "#BF0404", "C2C6AF",
    "#00FFFF", "#00FF00", "#FFFF00", "#FF5100", "FF007C",
    "#212629", "#CDCF19", "#FFF77D", "#96C4AB", "CF2A56",
    "#CFF9FF", "#BFC7BB", "#787051", "#332730", "57324F",
    "#98CACB", "#FDEFBE", "#F0542B", "#736E5B", "ABA68E",
    "#F2F1EB", "#BFB9A4", "#262222", "#802A30", "8C0303",
    "#65356B", "#AB434F", "#C76347", "#FFA24C", "519183",
    "#78BF82", "#A4D17C", "#CFD96C", "#EBD464", "FFD970",
    "#806265", "#FFA256", "#F7DD77", "#E0D054", "ABA73C",
    "#8F323C", "#123943", "#80BDDB", "#4189AB", "C98127",
    "#683820", "#8C9A89", "#E7D6A2", "#BEAA65", "9A8234",
    "#021B21", "#032C36", "#065F73", "#E8DFD6", "FF2A1D",
    "#2D6C73", "#3FA693", "#B4D9CB", "#9ABF49", "C6D93B",
    "#141F26", "#2B4040", "#405950", "#A69E86", "F2D9BB",
    "#4A8279", "#003330", "#610400", "#003B06", "02730F",
    "#69B5E1", "#D4E4F5", "#EAF2F8", "#BEDBED", "000000",
    "#893660", "#EF7261", "#68D693", "#A0D7E2", "299CA8",
    "#073A59", "#2D9AA6", "#F2E2DC", "#F23322", "A61B1B",
    "#2A3A48", "#3E6372", "#B2D4DC", "#FAFAFF", "FF6900",
    "#F3BD8D", "#F1A280", "#BE6D6B", "#704A5B", "3E263C",
    "#1C2742", "#3C91C7", "#5A9ABE", "#95C5DE", "E0EEFB",
    "#426261", "#465A59", "#577573", "#739A97", "9AC1C0",
    "#002A4A", "#17607D", "#FFF1CE", "#FF9311", "D64700",
    "#589373", "#BFBD99", "#F2D6B3", "#C2512F", "241E1E",
    "#1F518B", "#1488C8", "#F7E041", "#E2413E", "B5292A",
    "#549494", "#E85649", "#232C2E", "#E6E8D2", "706558",
    "#392133", "#FFECBE", "#D9D098", "#C4AB6D", "AB7D3A",
    "#F0F0F0", "#1C1C1C", "#A2FDF5", "#1CCDC7", "27EDDF",
    "#011526", "#025959", "#027353", "#03A678", "03A696",
    "#004358", "#1F8A70", "#BEDB39", "#FFE11A", "FD7400",
    "#37465D", "#F2F2F2", "#9DC02E", "#779324", "051A37",
    "#580022", "#AA2C30", "#FFBE8D", "#487B80", "011D24",
    "#F9F9F9", "#03A678", "#E9EDEB", "#F44647", "00707F",
    "#800000", "#BF0000", "#E2D6C2", "#F6EDD8", "FFFFFF",
    "#F7F6AF", "#1B2124", "#D62822", "#97D6A6", "468263",
    "#432852", "#992255", "#FF3D4C", "#28656E", "00968F",
    "#444344", "#52BBB2", "#2B344D", "#EE5555", "F8F7EE",
    "#45334A", "#796B7D", "#CCC4B0", "#FFF1B5", "FFA3A3",
    "#5A4B53", "#9C3C58", "#DE2B5B", "#D86A41", "D2A825",
    "#14151C", "#0C242B", "#297059", "#84D66E", "D1FB7A",
    "#272D40", "#364659", "#55736D", "#9DBF8E", "D0D991",
    "#23A38F", "#B7C11E", "#EFF1C2", "#F0563D", "2E313D",
    "#2E064D", "#80176B", "#B356A1", "#59580B", "FFFF00",
    "#CC3333", "#FF9D33", "#F7F7F0", "#3EBBA7", "00747A",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#F3B562", "BD6060",
    "#0D3E58", "#1C848C", "#19C0C2", "#F3EDD6", "DA6260",
    "#022629", "#2A5945", "#FAFFED", "#E6DCC0", "B3371C",
    "#F4FAC7", "#7BAD8D", "#FFB159", "#F77F45", "C2454E",
    "#A2C1C6", "#86B1B7", "#AECBAD", "#CFDCB0", "D6E1D1",
    "#B0DAFF", "#325B80", "#64B7FF", "#586D80", "5092CC",
    "#0F808C", "#6C8C26", "#F2A71B", "#F26A1B", "D91818",
    "#FFBC6C", "#FE9F6C", "#BD716E", "#74495F", "3B2C4D",
    "#FF4D41", "#F2931F", "#E6CA21", "#91B321", "1E8C65",
    "#302821", "#453629", "#5C4837", "#8A735F", "BDA895",
    "#415457", "#5F7B7F", "#9ACCAF", "#E6EBC4", "F9F7C8",
    "#474143", "#A69E9D", "#E7E2DA", "#FFFFFF", "E7E8E7",
    "#805939", "#BD9962", "#E6CD7D", "#578072", "2D4B4D",
    "#03588C", "#1763A6", "#419CA6", "#54BF83", "8DBF41",
    "#00CCFF", "#A1FCFF", "#040438", "#004878", "C9FAFF",
    "#534C64", "#B7DECF", "#F0F3D7", "#7E858C", "D96557",
    "#7F7364", "#CBB08E", "#CBC1B7", "#789DCB", "646F7F",
    "#5C2849", "#A73E5C", "#EC7263", "#FE9551", "FFD285",
    "#FF0012", "#FF7D00", "#FFD900", "#5BE300", "0084B0",
    "#F24C32", "#F29471", "#FCDFA6", "#36B898", "3D7585",
    "#083157", "#0A6C87", "#459C97", "#92CCA5", "C9F0B1",
    "#DC941B", "#EDC266", "#B6952C", "#E1D3A6", "E9A119",
    "#323836", "#BAD1B5", "#DBE8CF", "#F0F7E8", "FFFEF5",
    "#081724", "#589494", "#8EBBB4", "#D0DCD0", "F5EED2",
    "#50781C", "#9CAD1C", "#EAF7E6", "#40A5DE", "0B5191",
    "#537F79", "#78A68F", "#CBD49C", "#FED457", "CB252A",
    "#F23C13", "#CBAB78", "#FFFFFF", "#898373", "1F1C17",
    "#450003", "#5C0002", "#94090D", "#D40D12", "FFED75",
    "#0770A2", "#82D9F7", "#FEFEFE", "#AEC844", "F36622",
    "#30394F", "#FF434C", "#6ACEEB", "#EDE8DF", "0E6569",
    "#FF6B6B", "#556270", "#C7F464", "#4ECDC4", "EDC8BB",
    "#D9B500", "#FFED9C", "#BFCC85", "#748F74", "454545",
    "#452E32", "#A34B1B", "#B5A187", "#EDDF9A", "A7CC31",
    "#2C2B33", "#596664", "#909980", "#CCC08D", "FF8A00",
    "#C21F1F", "#FFFFFC", "#E34446", "#FFFFDB", "E36D6F",
    "#282828", "#00AAB5", "#C1C923", "#F41C54", "F5F0F0",
    "#3A3F40", "#202627", "#151B1E", "#EFF4FF", "41444D",
    "#DEBB73", "#4D0017", "#010000", "#4D0F30", "9A002F",
    "#EB9328", "#FFA754", "#FFD699", "#FFF5DC", "4FA6B3",
    "#025E73", "#037F8C", "#D9D59A", "#D9BD6A", "590202",
    "#636266", "#E0CEA4", "#E8A579", "#7D6855", "42403E",
    "#FF0000", "#FF4000", "#FF7F00", "#FFBF00", "FFFF00",
    "#FFFFFF", "#74ADA6", "#1E5E6F", "#241B1F", "68A81E",
    "#5A0532", "#FF6745", "#FFC861", "#9DAE64", "27404A",
    "#ACCBBC", "#467847", "#E8E4C1", "#A60303", "730202",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#F3B562", "F06060",
    "#0D2557", "#93A8C9", "#FFFFFF", "#F5DED5", "558D96",
    "#F53C4A", "#565157", "#10CFC8", "#F2EEE7", "F5D662",
    "#FFD97B", "#E65029", "#A60027", "#660033", "191C26",
    "#595408", "#A6800D", "#A66D03", "#A63F03", "730C02",
    "#2E031F", "#590424", "#8C072B", "#BF0A2B", "DEEFC5",
    "#E0C882", "#A6874E", "#BFA169", "#D9B779", "F2D399",
    "#D88681", "#A67673", "#746566", "#535A5D", "324F54",
    "#FC297D", "#FB607A", "#FDA286", "#FDC188", "FEE78A",
    "#FFECA1", "#B3B27F", "#4C5E52", "#2F3436", "FFBE2C",
    "#D93312", "#B3AB82", "#45735F", "#394D47", "2C3233",
    "#324143", "#6595A3", "#C8E3E8", "#FCFFED", "B6C28B",
    "#477984", "#FEF5EB", "#C03C44", "#EEAA4D", "313E4A",
    "#334D5C", "#45B29D", "#EFC94C", "#E27A3F", "DF4949",
    "#630B11", "#33322F", "#2A2927", "#1E1D1C", "000000",
    "#D94214", "#FFF2C1", "#80A894", "#52736B", "093844",
    "#051E21", "#00302D", "#856434", "#F28C28", "FFAD4E",
    "#D7DADD", "#DDDEE3", "#E1E1E9", "#EDEFF4", "F2F3F8",
    "#BF495E", "#41A693", "#F2EC9B", "#D9CF48", "D9583B",
    "#067072", "#14A589", "#DECFA6", "#BAAE8C", "F94B06",
    "#423A38", "#47B8C8", "#E7EEE2", "#BDB9B1", "D7503E",
    "#730324", "#DFE3E6", "#B4C4D4", "#8BA2BD", "456382",
    "#537374", "#F9BD7F", "#EBD7A5", "#ADC9A5", "5C9E99",
    "#88B59E", "#B6DEC8", "#39464D", "#C04229", "ABD1AB",
    "#11A7FC", "#95D127", "#F2E415", "#FF8638", "EE3551",
    "#212640", "#5D718C", "#4B95A6", "#60BFBF", "EFF2D8",
    "#D8A64D", "#9B5422", "#351411", "#5B0D0D", "991C11",
    "#53324F", "#668D6E", "#F2E0A0", "#F19B7A", "F0756E",
    "#DFE0AF", "#A4BAA2", "#569492", "#41505E", "383245",
    "#7BBADE", "#93DE7F", "#FFED5D", "#F29E4A", "FF7050",
    "#133800", "#1B4F1B", "#398133", "#5C9548", "93E036",
    "#D9D7AD", "#91A685", "#FF6A00", "#37485C", "1C232E",
    "#008767", "#FFB27A", "#FF6145", "#AB2141", "5E1638",
    "#727B7F", "#CCEAEA", "#7A7556", "#2E2125", "44CACC",
    "#FFFFED", "#FF2C38", "#FF9A3A", "#FFF040", "67D9FF",
    "#007148", "#60A859", "#9BDA6A", "#C7F774", "F9FFEF",
    "#092740", "#45698B", "#90B0CC", "#F1FAFF", "8FD36F",
    "#E2FFA0", "#7D8076", "#FAFFED", "#C2CCBE", "8F7D70",
    "#00736A", "#00BC9F", "#F1EEC7", "#FEA301", "F2561A",
    "#26282E", "#AD5138", "#F7F7F7", "#DDDAE0", "8594AE",
    "#1A191F", "#35352F", "#484042", "#4E5252", "E64D38",
    "#49454A", "#E69B02", "#FAF4C6", "#B1D631", "324052",
    "#5F1A2B", "#1D2834", "#6F8B78", "#E4D49E", "C96466",
    "#012D3D", "#38AD9E", "#FFEB9E", "#FF6867", "D0DBED",
    "#0D1F36", "#104954", "#1E9C89", "#38CC85", "60EB7B",
    "#8C4E03", "#9FA66A", "#F2EC94", "#F23005", "8B0F03",
    "#000001", "#20201F", "#E2E2E4", "#590402", "B80000",
    "#344059", "#465973", "#F2D272", "#A69460", "595139",
    "#33454C", "#608F85", "#B6E5CB", "#8BAF95", "54584E",
    "#FBFEF6", "#B7BFA4", "#687F70", "#1A3841", "BF3847",
    "#D7E836", "#86FFC7", "#FFB048", "#E8366C", "593BFF",
    "#34A9FF", "#5982DB", "#665EB8", "#684682", "632E62",
    "#004056", "#2C858D", "#74CEB7", "#C9FFD5", "FFFFCB",
    "#BFB978", "#84945C", "#516967", "#4D3130", "281B24",
    "#103B73", "#20638C", "#3786A6", "#4EABBF", "EBEFF2",
    "#9FB1BF", "#1D2D63", "#1C5357", "#1F6E56", "196331",
    "#FFEBBA", "#C3BD91", "#88947B", "#4C3F3F", "2A2727",
    "#347373", "#4EA6A6", "#91D9D9", "#FFFFFD", "F2E205",
    "#828948", "#EFDFC2", "#006971", "#DC533E", "840000",
    "#000137", "#29003F", "#79003D", "#D04D14", "F89801",
    "#370005", "#4B0005", "#5F0005", "#730005", "870005",
    "#C3AE8D", "#F25260", "#2D5F73", "#6BADC9", "8FCED6",
    "#9E1B36", "#F7EDBA", "#E69B3D", "#EB3355", "3D241D",
    "#1D8281", "#44BF87", "#FBD258", "#F29A3F", "DB634F",
    "#035C75", "#1B808C", "#31A6A8", "#F3F1BC", "F3AD14",
    "#FF7500", "#665130", "#EBB643", "#CEDAA8", "668E84",
    "#384D3A", "#3E6653", "#728053", "#A68357", "D97C71",
    "#012326", "#17455C", "#E1CAAB", "#FE8333", "FA4913",
    "#1A2944", "#2DA7C7", "#56ACBA", "#98C4C9", "CBD5D2",
    "#BF3542", "#CDC5BA", "#EBE3D6", "#3C3C3C", "2E2E2E",
    "#231921", "#695F74", "#BEB4CB", "#EBEBF0", "D2DCEB",
    "#34373F", "#686C75", "#F3E9D0", "#BEB7A7", "8E867C",
    "#661510", "#D9351A", "#F2C76F", "#BF9727", "204D3F",
    "#3CFFEE", "#24AABC", "#356781", "#2C3D51", "1C1F24",
    "#DA3537", "#FFFCC4", "#00585F", "#6A6A61", "2A2C2B",
    "#AE3135", "#D1AF87", "#8C826B", "#3D3C33", "F2F0CE",
    "#FF0894", "#FF5E9F", "#FF91A7", "#FFB5CA", "F5F0BA",
    "#99878D", "#323232", "#646464", "#7E4A5C", "372129",
    "#3FB8AF", "#7FC7AF", "#DAD8A7", "#FFB38B", "FF3F34",
    "#402B3C", "#6AA6A6", "#D9CCA7", "#F2B263", "F26835",
    "#6AA690", "#F2BC1B", "#F2DC99", "#F29057", "BF1F1F",
    "#F4FAC7", "#7BAD8D", "#FFB158", "#F77F45", "C2454E",
    "#E5533C", "#F5E346", "#93D06D", "#50AC6A", "227864",
    "#39588A", "#A9BDD7", "#FFFFFF", "#FFEADD", "FFD0BB",
    "#B0B595", "#615F4F", "#828567", "#91A380", "EAFFCD",
    "#00427F", "#0066BD", "#66B5CC", "#F0E4C5", "D6C28F",
    "#FF6313", "#F9E4B3", "#C29689", "#74474B", "45232E",
    "#00585F", "#009393", "#FFFCC4", "#C7C49B", "EB0A00",
    "#091840", "#44A2FF", "#F7F7EA", "#B3CC63", "4C6620",
    "#5CBBE3", "#FCF1BC", "#5C8182", "#383A47", "B4F257",
    "#9E9E9E", "#E5E1D1", "#E0393D", "#253746", "425563",
    "#4D9453", "#FFFFB1", "#ADDE4E", "#FF9D27", "A62A16",
    "#B70046", "#FF850B", "#FFEBC5", "#109679", "675A4C",
    "#363636", "#0599B0", "#A4BD0A", "#FFA615", "FF2E00",
    "#7D8077", "#BBBFB2", "#FAFFED", "#E82A33", "E3DEBC",
    "#FD9F44", "#FC5C65", "#007269", "#03A679", "FAF0B9",
    "#134B57", "#81A489", "#F1D8B5", "#F2A054", "C04D31",
    "#946E49", "#394042", "#EDDBAC", "#872A0C", "BA8E3A",
    "#404040", "#024959", "#037E8C", "#FFFFFF", "F24C27",
    "#2A3342", "#163C6E", "#4E5F61", "#E6A015", "EDE7BE",
    "#445060", "#829AB5", "#849E91", "#C14543", "D6D5D1",
    "#8A9126", "#B7BF5E", "#FFE9C4", "#F5B776", "F58E45",
    "#9B2D1E", "#3C3A28", "#78A080", "#9BCD9E", "FFFFAE",
    "#FF6138", "#FFFF9D", "#BEEB9F", "#79BD8F", "00A388",
    "#990000", "#FF6600", "#FF9900", "#996633", "CC9966",
    "#DCE6DA", "#B8CCBB", "#98B3A5", "#7A9994", "62858C",
    "#0B1C29", "#3B7C8F", "#73A5A3", "#98C1B7", "F0EBD2",
    "#F6CB51", "#E25942", "#13A89E", "#3F4953", "F2E7DA",
    "#282F36", "#FFFEFC", "#BDA21D", "#BFBC5B", "D2E098",
    "#8C182D", "#DE7140", "#FCB95A", "#FAE285", "6A7349",
    "#6B9100", "#FFE433", "#FF841F", "#E03D19", "A6001C",
    "#FFEAA7", "#D9D697", "#9FC49F", "#718C6A", "543122",
    "#CFF09E", "#A8DBA8", "#79BD9A", "#3B8686", "0B486B",
    "#0C2233", "#065471", "#0A91AB", "#FFC045", "F2F2F2",
    "#BEE8E0", "#373C40", "#2E2621", "#73320B", "FF5E00",
    "#1B2C35", "#A3BFC6", "#FF005D", "#222A30", "293A42",
    "#FF8400", "#3B4044", "#494948", "#E6E1D8", "F7F2E9",
    "#6A482D", "#518C86", "#F6BF3D", "#EF7C27", "BF2424",
    "#261C2B", "#292B39", "#226468", "#608D80", "829D8F",
    "#B2AD9A", "#110E00", "#363226", "#A9A695", "ECE9D8",
    "#1B1B26", "#26394D", "#286480", "#13B3BF", "A3FF57",
    "#F2C2A7", "#F5E5C5", "#593D28", "#422C21", "93DEDB",
    "#001028", "#033140", "#1E5A5B", "#7BA78C", "EBEDC6",
    "#544E6E", "#808CB0", "#ABD1D9", "#D9FFF7", "DDF556",
    "#323A45", "#596677", "#758194", "#FFFFFF", "E74C3C",
    "#45291A", "#AB926D", "#DBD1BC", "#4999C3", "5FCBEC",
    "#6B151D", "#2E1615", "#A8553A", "#DB8F5A", "F2C18E",
    "#000623", "#28475C", "#4A6C74", "#8BA693", "F0E3B1",
    "#60807B", "#81B37A", "#BCCC5F", "#FFEE65", "E64964",
    "#FFFFFA", "#A1A194", "#5B605F", "#464646", "FF6600",
    "#1E1B17", "#577270", "#9C9A79", "#C7BDA1", "580E0C",
    "#452F27", "#5E504A", "#6B6865", "#9BBAB2", "B0FFED",
    "#1B5257", "#F7F6C3", "#F28159", "#CC5850", "4F1C2E",
    "#FAA51B", "#BF511F", "#2C445E", "#2F6D82", "5EE4EB",
    "#BF3952", "#59364A", "#556D73", "#D9D1A9", "D95F5F",
    "#024959", "#037E8C", "#F2EFDC", "#E74C30", "363636",
    "#221A26", "#544759", "#A197A6", "#F27405", "D93D04",
    "#C4A44A", "#E6D399", "#9AB8A9", "#7C8A7F", "4E4B44",
    "#FFFEC8", "#B1BF99", "#5B604D", "#39382B", "26181E",
    "#4E3C51", "#21A68D", "#3BBF9A", "#F2E8B6", "F25749",
    "#102144", "#1B325E", "#254580", "#3C63B0", "5D8AEA",
    "#2A3A48", "#3E6372", "#B2D4DC", "#FAFAFF", "FF4B00",
    "#FFF1BF", "#F20058", "#FFAEAC", "#000001", "7D7A96",
    "#FDFFC6", "#F2F096", "#FF0080", "#DE0049", "521218",
    "#5B0E00", "#FBB500", "#FBD864", "#807D1A", "59233C",
    "#1E1E1F", "#424143", "#67666A", "#807F83", "CBC9CF",
    "#3C3658", "#3EC8B7", "#7CD0B4", "#B9D8B1", "F7E0AE",
    "#FFFFFF", "#99B75F", "#D5DD98", "#EBF4DB", "D8D8D8",
    "#248A8A", "#C9FA58", "#F9E555", "#FAAC38", "F2572A",
    "#086B63", "#77A490", "#E2D8C1", "#BFAE95", "7C7159",
    "#5C4B51", "#8CBEB2", "#F2EBBF", "#A5C88F", "EF847B",
    "#17162F", "#89346D", "#C76058", "#FFB248", "E8C475",
    "#6E8F4A", "#65D9C5", "#F2E7B6", "#EDA430", "AB3E2C",
    "#30394F", "#FF434C", "#6ACEEB", "#EDE8DF", "0E6569",
    "#8E1B13", "#F9E4B3", "#849689", "#46464A", "29232E",
    "#686B30", "#AB9A52", "#E8BA67", "#D68F4F", "BA512E",
    "#E54E45", "#DBC390", "#F2F2EF", "#13A3A5", "403833",
    "#65BA99", "#59A386", "#F1DDBB", "#D6C4A6", "E74C3C",
    "#A6FFBC", "#4ACFAF", "#00A995", "#006161", "003D4C",
    "#33271E", "#8B7653", "#C8D9A0", "#FDEE9D", "233331",
    "#048789", "#503D2E", "#D44D27", "#E2A72E", "EFEBC8",
    "#E5FF1E", "#A9D943", "#75A660", "#698070", "494D4B",
    "#2DEBA2", "#91F57F", "#EBAA69", "#E70049", "2B0027",
    "#990000", "#336699", "#DDDDDD", "#999999", "333333",
    "#F13A4B", "#3D3C3E", "#22BDAF", "#F4F4F4", "D7D7D7",
    "#F53A59", "#001D2D", "#15A88C", "#B7D9C8", "F3F5F4",];


};

Ops.Color.ColorPalettes.prototype = new CABLES.Op();
CABLES.OPS["31d33a1e-9a0a-49f7-8bc8-9e83ab71e23e"]={f:Ops.Color.ColorPalettes,objName:"Ops.Color.ColorPalettes"};




// **************************************************************
// 
// Ops.Ui.VizTexture
// 
// **************************************************************

Ops.Ui.VizTexture = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"viztex_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI samplerCube cubeMap;\nUNI float width;\nUNI float height;\nUNI float type;\nUNI float time;\n\nfloat LinearizeDepth(float d,float zNear,float zFar)\n{\n    float z_n = 2.0 * d - 1.0;\n    return 2.0 * zNear / (zFar + zNear - z_n * (zFar - zNear));\n}\n\nvoid main()\n{\n    vec4 col=vec4(vec3(0.),0.0);\n\n    vec4 colTex=texture(tex,texCoord);\n\n\n\n    if(type==1.0)\n    {\n        vec4 depth=vec4(0.);\n        vec2 localST=texCoord;\n        localST.y = 1. - localST.y;\n\n        localST.t = mod(localST.t*3.,1.);\n        localST.s = mod(localST.s*4.,1.);\n\n        #ifdef WEBGL2\n            #define texCube texture\n        #endif\n        #ifdef WEBGL1\n            #define texCube textureCube\n        #endif\n\n//         //Due to the way my depth-cubeMap is rendered, objects to the -x,y,z side is projected to the positive x,y,z side\n//         //Inside where top/bottom is to be drawn?\n        if (texCoord.s*4.> 1. && texCoord.s*4.<2.)\n        {\n            //Bottom (-y) quad\n            if (texCoord.t*3. < 1.)\n            {\n                vec3 dir=vec3(localST.s*2.-1.,-1.,-localST.t*2.+1.);//Due to the (arbitrary) way I choose as up in my depth-viewmatrix, i her emultiply the latter coordinate with -1\n                depth = texCube(cubeMap, dir);\n            }\n            //top (+y) quad\n            else if (texCoord.t*3. > 2.)\n            {\n                vec3 dir=vec3(localST.s*2.-1.,1.,localST.t*2.-1.);//Get lower y texture, which is projected to the +y part of my cubeMap\n                depth = texCube(cubeMap, dir);\n            }\n            else//Front (-z) quad\n            {\n                vec3 dir=vec3(localST.s*2.-1.,-localST.t*2.+1.,1.);\n                depth = texCube(cubeMap, dir);\n            }\n        }\n//         //If not, only these ranges should be drawn\n        else if (texCoord.t*3. > 1. && texCoord.t*3. < 2.)\n        {\n            if (texCoord.x*4. < 1.)//left (-x) quad\n            {\n                vec3 dir=vec3(-1.,-localST.t*2.+1.,localST.s*2.-1.);\n                depth = texCube(cubeMap, dir);\n            }\n            else if (texCoord.x*4. < 3.)//right (+x) quad (front was done above)\n            {\n                vec3 dir=vec3(1,-localST.t*2.+1.,-localST.s*2.+1.);\n                depth = texCube(cubeMap, dir);\n            }\n            else //back (+z) quad\n            {\n                vec3 dir=vec3(-localST.s*2.+1.,-localST.t*2.+1.,-1.);\n                depth = texCube(cubeMap, dir);\n            }\n        }\n        // colTex = vec4(vec3(depth),1.);\n        colTex = vec4(depth);\n    }\n\n    if(type==2.0)\n    {\n       float near = 0.1;\n       float far = 50.;\n       float depth = LinearizeDepth(colTex.r, near, far);\n       colTex.rgb = vec3(depth);\n    }\n\n    if(colTex.r>1.0 || colTex.r<0.0)\n    {\n        float r=mod( time+colTex.r,1.0)*0.5+0.5;\n        colTex.r=r;\n    }\n    if(colTex.g>1.0 || colTex.g<0.0)\n    {\n        float r=mod( time+colTex.g,1.0)*0.5+0.5;\n        colTex.g=r;\n    }\n    if(colTex.b>1.0 || colTex.b<0.0)\n    {\n        float r=mod( time+colTex.b,1.0)*0.5+0.5;\n        colTex.b=r;\n    }\n\n\n    outColor = mix(col,colTex,colTex.a);\n}\n\n","viztex_vert":"IN vec3 vPosition;\nIN vec2 attrTexCoord;\nOUT vec2 texCoord;\nUNI mat4 projMatrix;\nUNI mat4 modelMatrix;\nUNI mat4 viewMatrix;\n\nvoid main()\n{\n    texCoord=vec2(attrTexCoord.x,1.0-attrTexCoord.y);\n    vec4 pos = vec4( vPosition, 1. );\n    mat4 mvMatrix=viewMatrix * modelMatrix;\n    gl_Position = projMatrix * mvMatrix * pos;\n}",};
const
    inTex = op.inTexture("Texture In"),
    inShowInfo = op.inBool("Show Info", false),
    outTex = op.outTexture("Texture Out"),
    outInfo = op.outString("Info");

op.setUiAttrib({ "height": 150, "resizable": true });

const timer = new CABLES.Timer();
timer.play();

inTex.onChange = () =>
{
    const t = inTex.get();

    outTex.set(CGL.Texture.getEmptyTexture(op.patch.cgl));
    outTex.set(t);
};

op.renderVizLayer = (ctx, layer) =>
{
    const port = inTex;
    const texSlot = 5;
    const texSlotCubemap = texSlot + 1;

    const perf = CABLES.UI.uiProfiler.start("previewlayer texture");
    const cgl = port.parent.patch.cgl;

    if (!this._emptyCubemap) this._emptyCubemap = CGL.Texture.getEmptyCubemapTexture(cgl);
    port.parent.patch.cgl.profileData.profileTexPreviews++;

    const portTex = port.get() || CGL.Texture.getEmptyTexture(cgl);

    if (!this._mesh)
    {
        const geom = new CGL.Geometry("preview op rect");
        geom.vertices = [1.0, 1.0, 0.0, -1.0, 1.0, 0.0, 1.0, -1.0, 0.0, -1.0, -1.0, 0.0];
        geom.texCoords = [
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0];
        geom.verticesIndices = [0, 1, 2, 3, 1, 2];
        this._mesh = new CGL.Mesh(cgl, geom);
    }
    if (!this._shader)
    {
        this._shader = new CGL.Shader(cgl, "glpreviewtex");
        this._shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);
        this._shader.setSource(attachments.viztex_vert, attachments.viztex_frag);
        this._shaderTexUniform = new CGL.Uniform(this._shader, "t", "tex", texSlot);
        this._shaderTexCubemapUniform = new CGL.Uniform(this._shader, "tc", "cubeMap", texSlotCubemap);

        this._shaderTexUniformW = new CGL.Uniform(this._shader, "f", "width", portTex.width);
        this._shaderTexUniformH = new CGL.Uniform(this._shader, "f", "height", portTex.height);
        this._shaderTypeUniform = new CGL.Uniform(this._shader, "f", "type", 0);
        this._shaderTimeUniform = new CGL.Uniform(this._shader, "f", "time", 0);
    }

    cgl.pushPMatrix();
    const sizeTex = [portTex.width, portTex.height];
    const small = port.parent.patch.cgl.canvasWidth > sizeTex[0] && port.parent.patch.cgl.canvasHeight > sizeTex[1];

    if (small)
    {
        mat4.ortho(cgl.pMatrix, 0, port.parent.patch.cgl.canvasWidth, port.parent.patch.cgl.canvasHeight, 0, 0.001, 11);
    }
    else mat4.ortho(cgl.pMatrix, -1, 1, 1, -1, 0.001, 11);

    const oldTex = cgl.getTexture(texSlot);
    const oldTexCubemap = cgl.getTexture(texSlotCubemap);

    let texType = 0;
    if (!portTex) return;
    if (portTex.cubemap) texType = 1;
    if (portTex.textureType == CGL.Texture.TYPE_DEPTH) texType = 2;

    if (texType == 0 || texType == 2)
    {
        cgl.setTexture(texSlot, portTex.tex);
        cgl.setTexture(texSlotCubemap, this._emptyCubemap.cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }
    else if (texType == 1)
    {
        cgl.setTexture(texSlotCubemap, portTex.cubemap, cgl.gl.TEXTURE_CUBE_MAP);
    }

    timer.update();
    this._shaderTimeUniform.setValue(timer.get());

    this._shaderTypeUniform.setValue(texType);
    let s = [port.parent.patch.cgl.canvasWidth, port.parent.patch.cgl.canvasHeight];

    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);

    cgl.pushModelMatrix();
    if (small)
    {
        s = sizeTex;
        mat4.translate(cgl.mMatrix, cgl.mMatrix, [sizeTex[0] / 2, sizeTex[1] / 2, 0]);
        mat4.scale(cgl.mMatrix, cgl.mMatrix, [sizeTex[0] / 2, sizeTex[1] / 2, 0]);
    }
    this._mesh.render(this._shader);
    cgl.popModelMatrix();

    if (texType == 0) cgl.setTexture(texSlot, oldTex);
    if (texType == 1) cgl.setTexture(texSlotCubemap, oldTexCubemap);

    cgl.popPMatrix();
    cgl.resetViewPort();

    const sizeImg = [layer.width, layer.height];

    const stretch = false;
    if (!stretch)
    {
        if (portTex.width > portTex.height) sizeImg[1] = layer.width * sizeTex[1] / sizeTex[0];
        else
        {
            sizeImg[1] = layer.width * (sizeTex[1] / sizeTex[0]);

            if (sizeImg[1] > layer.height)
            {
                const r = layer.height / sizeImg[1];
                sizeImg[0] *= r;
                sizeImg[1] *= r;
            }
        }
    }

    const scaledDown = sizeImg[0] > sizeTex[0] && sizeImg[1] > sizeTex[1];

    ctx.imageSmoothingEnabled = !small || !scaledDown;

    if (!ctx.imageSmoothingEnabled)
    {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(layer.x, layer.y - 10, 10, 10);
        ctx.fillStyle = "#000000";
        ctx.fillRect(layer.x, layer.y - 10, 5, 5);
        ctx.fillRect(layer.x + 5, layer.y - 10 + 5, 5, 5);
    }

    let numX = (10 * layer.width / layer.height);
    let stepY = (layer.height / 10);
    let stepX = (layer.width / numX);
    for (let x = 0; x < numX; x++)
        for (let y = 0; y < 10; y++)
        {
            if ((x + y) % 2 == 0)ctx.fillStyle = "#333333";
            else ctx.fillStyle = "#393939";
            ctx.fillRect(layer.x + stepX * x, layer.y + stepY * y, stepX, stepY);
        }

    ctx.fillStyle = "#222";
    const borderLeft = (layer.width - sizeImg[0]) / 2;
    const borderTop = (layer.height - sizeImg[1]) / 2;
    ctx.fillRect(
        layer.x, layer.y,
        borderLeft, (layer.height)
    );
    ctx.fillRect(
        layer.x + sizeImg[0] + borderLeft, layer.y,
        borderLeft, (layer.height)
    );
    ctx.fillRect(
        layer.x, layer.y,
        layer.width, borderTop
    );
    ctx.fillRect(
        layer.x, layer.y + sizeImg[1] + borderTop,
        layer.width, borderTop
    );

    if (sizeTex[1] == 1)
        ctx.drawImage(cgl.canvas,
            0, 0,
            s[0], s[1],
            layer.x, layer.y,
            layer.width, layer.height * 5);// workaround filtering problems
    if (sizeTex[0] == 1)
        ctx.drawImage(cgl.canvas,
            0, 0,
            s[0], s[1],
            layer.x, layer.y,
            layer.width * 5, layer.height); // workaround filtering problems
    else
        ctx.drawImage(cgl.canvas,
            0, 0,
            s[0], s[1],
            layer.x + (layer.width - sizeImg[0]) / 2, layer.y + (layer.height - sizeImg[1]) / 2,
            sizeImg[0], sizeImg[1]);

    let info = "unknown";

    if (port.get() && port.get().getInfoOneLine) info = port.get().getInfoOneLine();

    if (inShowInfo.get())
    {
        ctx.save();
        ctx.scale(layer.scale, layer.scale);
        ctx.font = "normal 10px sourceCodePro";
        ctx.fillStyle = "#000";
        ctx.fillText(info, layer.x / layer.scale + 5 + 0.75, (layer.y + layer.height) / layer.scale - 5 + 0.75);
        ctx.fillStyle = "#fff";
        ctx.fillText(info, layer.x / layer.scale + 5, (layer.y + layer.height) / layer.scale - 5);
        ctx.restore();
    }

    outInfo.set(info);

    cgl.gl.clearColor(0, 0, 0, 0);
    cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);

    perf.finish();
};


};

Ops.Ui.VizTexture.prototype = new CABLES.Op();
CABLES.OPS["4ea2d7b0-ca74-45db-962b-4d1965ac20c0"]={f:Ops.Ui.VizTexture,objName:"Ops.Ui.VizTexture"};




// **************************************************************
// 
// Ops.Array.RandomArrays
// 
// **************************************************************

Ops.Array.RandomArrays = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const numValues = op.inValueInt("Num Values", 100);
const inModeSwitch = op.inSwitch("Mode", ["A", "AB", "ABC", "ABCD"], "A");
const inSeed = op.inValueFloat("Random Seed ", 0);
const inInteger = op.inBool("Integer", false);
const outValues = op.outArray("Array Out");

const letters = ["A", "B", "C", "D"];

const inArray = letters.map(function (value)
{
    return {
        "min": op.inValueFloat("Min " + value, -1),
        "max": op.inValueFloat("Max " + value, 1),
    };
});

for (let i = 0; i < inArray.length; i += 1)
{
    const portObj = inArray[i];
    const keys = Object.keys(portObj);

    op.setPortGroup("Value Range " + letters[i], keys.map(function (key) { return portObj[key]; }));

    if (i > 0) keys.forEach(function (key) { portObj[key].setUiAttribs({ "greyout": true }); });
}


inModeSwitch.onChange = function ()
{
    const mode = inModeSwitch.get();
    const modes = inModeSwitch.uiAttribs.values;

    outValues.setUiAttribs({ "stride": inModeSwitch.get().length });

    const index = modes.indexOf(mode);

    inArray.forEach(function (portObj, i)
    {
        const keys = Object.keys(portObj);
        keys.forEach(function (key, j)
        {
            if (i <= index) portObj[key].setUiAttribs({ "greyout": false });
            else portObj[key].setUiAttribs({ "greyout": true });
        });
    });
    init();
};

const outTotalPoints = op.outNumber("Chunks Amount");
const outArrayLength = op.outNumber("Array length");

outValues.ignoreValueSerialize = true;

numValues.onChange = inSeed.onChange = inInteger.onChange = init;

const minMaxArray = [];

init();

function init()
{
    const arr = [];
    const mode = inModeSwitch.get();
    const modes = inModeSwitch.uiAttribs.values;
    const index = modes.indexOf(mode);

    Math.randomSeed = inSeed.get();

    const dimension = index + 1;
    const length = Math.floor(Math.abs(numValues.get() * dimension));

    arr.length = length;
    const tupleLength = length / dimension;
    const isInteger = inInteger.get();

    // optimization: we only need to fetch the max min for each component once
    for (let i = 0; i < dimension; i += 1)
    {
        const portObj = inArray[i];
        const max = portObj.max.get();
        const min = portObj.min.get();
        minMaxArray[i] = [min, max];
    }

    for (let j = 0; j < tupleLength; j += 1)
    {
        for (let k = 0; k < dimension; k += 1)
        {
            const min = minMaxArray[k][0];
            const max = minMaxArray[k][1];
            const index = j * dimension + k;

            if (isInteger) arr[index] = Math.floor(Math.seededRandom() * ((max + 1) - min) + min);
            else arr[index] = Math.seededRandom() * (max - min) + min;
        }
    }

    outValues.set(null);

    outValues.set(arr);
    outTotalPoints.set(arr.length / dimension);
    outArrayLength.set(arr.length);
}

// assign change handler
inArray.forEach(function (obj)
{
    Object.keys(obj).forEach(function (key)
    {
        const x = obj[key];
        x.onChange = init;
    });
});


};

Ops.Array.RandomArrays.prototype = new CABLES.Op();
CABLES.OPS["8a9fa2c6-c229-49a9-9dc8-247001539217"]={f:Ops.Array.RandomArrays,objName:"Ops.Array.RandomArrays"};




// **************************************************************
// 
// Ops.Value.Number
// 
// **************************************************************

Ops.Value.Number = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    v = op.inValueFloat("value"),
    result = op.outNumber("result");

v.onChange = exec;

function exec()
{
    result.set(Number(v.get()));
}


};

Ops.Value.Number.prototype = new CABLES.Op();
CABLES.OPS["8fb2bb5d-665a-4d0a-8079-12710ae453be"]={f:Ops.Value.Number,objName:"Ops.Value.Number"};




// **************************************************************
// 
// Ops.Vars.VarSetNumber_v2
// 
// **************************************************************

Ops.Vars.VarSetNumber_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const val = op.inValueFloat("Value", 0);
op.varName = op.inDropDown("Variable", [], "", true);

new CABLES.VarSetOpWrapper(op, "number", val, op.varName);


};

Ops.Vars.VarSetNumber_v2.prototype = new CABLES.Op();
CABLES.OPS["b5249226-6095-4828-8a1c-080654e192fa"]={f:Ops.Vars.VarSetNumber_v2,objName:"Ops.Vars.VarSetNumber_v2"};




// **************************************************************
// 
// Ops.Vars.VarGetNumber_v2
// 
// **************************************************************

Ops.Vars.VarGetNumber_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const val = op.outNumber("Value");
op.varName = op.inValueSelect("Variable", [], "", true);

new CABLES.VarGetOpWrapper(op, "number", op.varName, val);


};

Ops.Vars.VarGetNumber_v2.prototype = new CABLES.Op();
CABLES.OPS["421f5b52-c0fa-47c4-8b7a-012b9e1c864a"]={f:Ops.Vars.VarGetNumber_v2,objName:"Ops.Vars.VarGetNumber_v2"};




// **************************************************************
// 
// Ops.Gl.Meshes.PointCloudFromArray
// 
// **************************************************************

Ops.Gl.Meshes.PointCloudFromArray = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    arr = op.inArray("Array", 3),
    numPoints = op.inValueInt("Num Points"),
    outTrigger = op.outTrigger("Trigger out"),
    outGeom = op.outObject("Geometry"),
    pTexCoordRand = op.inValueBool("Scramble Texcoords", true),
    seed = op.inValue("Seed", 1),
    inCoords = op.inArray("Coordinates", 2),
    vertCols = op.inArray("Vertex Colors", 4);

op.toWorkPortsNeedToBeLinked(arr, exe);
op.setPortGroup("Texture Coordinates", [pTexCoordRand, seed, inCoords]);

const cgl = op.patch.cgl;
const geom = new CGL.Geometry("pointcloudfromarray");
let deactivated = false;
let mesh = null;
let texCoords = [];
let needsRebuild = true;
let showingError = false;

arr.setUiAttribs({ "title": "Positions" });
inCoords.setUiAttribs({ "title": "Texture Coordinates" });

inCoords.onChange =
    pTexCoordRand.onChange = updateTexCoordsPorts;
vertCols.onChange = updateVertCols;
numPoints.onChange = updateNumVerts;
seed.onChange = arr.onChange = vertCols.onLinkChanged = reset;

exe.onTriggered = doRender;

function doRender()
{
    outTrigger.trigger();
    if (CABLES.UI)
    {
        let shader = cgl.getShader();
        if (shader.glPrimitive != cgl.gl.POINTS) op.setUiError("nopointmat", "Using a Material not made for point rendering. Try to use PointMaterial.");
        else op.setUiError("nopointmat", null);
    }

    if (needsRebuild || !mesh) rebuild();
    if (!deactivated && mesh) mesh.render(cgl.getShader());
}

function reset()
{
    deactivated = arr.get() == null;

    if (!deactivated)needsRebuild = true;
    else needsRebuild = false;
}

function updateTexCoordsPorts()
{
    if (inCoords.isLinked())
    {
        seed.setUiAttribs({ "greyout": true });
        pTexCoordRand.setUiAttribs({ "greyout": true });
    }
    else
    {
        pTexCoordRand.setUiAttribs({ "greyout": false });

        if (!pTexCoordRand.get()) seed.setUiAttribs({ "greyout": true });
        else seed.setUiAttribs({ "greyout": false });
    }

    mesh = null;
    needsRebuild = true;
}

function updateVertCols()
{
    if (!vertCols.get()) return;
    if (!geom.vertexColors) reset();

    if (mesh)mesh.setAttribute(CGL.SHADERVAR_VERTEX_COLOR, vertCols.get(), 4);
}

function updateNumVerts()
{
    if (mesh)
    {
        mesh.setNumVertices(Math.min(geom.vertices.length / 3, numPoints.get()));
        if (numPoints.get() == 0)mesh.setNumVertices(geom.vertices.length / 3);
    }
}

function rebuild()
{
    let verts = arr.get();

    if (!verts || verts.length == 0)
    {
        // mesh=null;
        return;
    }

    if (verts.length % 3 !== 0)
    {
        // if (!showingError)
        // {
        op.setUiError("div3", "Array length not multiple of 3");

        // op.uiAttr({ "error": "Array length not divisible by 3!" });
        // showingError = true;
        // }
        return;
    }
    else op.setUiError("div3", null);

    if (geom.vertices.length == verts.length && mesh && !inCoords.isLinked() && !vertCols.isLinked())
    {
        mesh.setAttribute(CGL.SHADERVAR_VERTEX_POSITION, verts, 3);
        geom.vertices = verts;
        needsRebuild = false;

        return;
    }

    geom.clear();
    let num = verts.length / 3;
    num = Math.abs(Math.floor(num));

    if (num == 0) return;

    if (!texCoords || texCoords.length != num * 2) texCoords = new Float32Array(num * 2); // num*2;//=

    let changed = true;
    let rndTc = pTexCoordRand.get();

    if (!inCoords.isLinked())
    {
        Math.randomSeed = seed.get();
        texCoords = []; // needed otherwise its using the reference to input incoords port
        // let genCoords = !inCoords.isLinked();

        for (let i = 0; i < num; i++)
        {
            if (geom.vertices[i * 3] != verts[i * 3] ||
                geom.vertices[i * 3 + 1] != verts[i * 3 + 1] ||
                geom.vertices[i * 3 + 2] != verts[i * 3 + 2])
            {
                // if (genCoords)
                if (rndTc)
                {
                    texCoords[i * 2] = Math.seededRandom();
                    texCoords[i * 2 + 1] = Math.seededRandom();
                }
                else
                {
                    texCoords[i * 2] = i / num;
                    texCoords[i * 2 + 1] = i / num;
                }
            }
        }
    }

    if (vertCols.get())
    {
        if (!showingError && vertCols.get().length != num * 4)
        {
            op.uiAttr({ "error": "Color array does not have the correct length! (should be " + num * 4 + ")" });
            showingError = true;
            mesh = null;
            return;
        }

        geom.vertexColors = vertCols.get();
    }
    else geom.vertexColors = [];

    if (changed)
    {
        if (inCoords.isLinked()) texCoords = inCoords.get();

        geom.setPointVertices(verts);
        geom.setTexCoords(texCoords);
        // geom.verticesIndices = [];

        if (mesh)mesh.dispose();
        mesh = new CGL.Mesh(cgl, geom, cgl.gl.POINTS);

        mesh.addVertexNumbers = true;
        mesh.setGeom(geom);

        outGeom.set(null);
        outGeom.set(geom);
    }

    updateNumVerts();
    needsRebuild = false;
}


};

Ops.Gl.Meshes.PointCloudFromArray.prototype = new CABLES.Op();
CABLES.OPS["0a6d9c6f-6459-45ca-88ad-268a1f7304db"]={f:Ops.Gl.Meshes.PointCloudFromArray,objName:"Ops.Gl.Meshes.PointCloudFromArray"};




// **************************************************************
// 
// Ops.Array.ArrayMath
// 
// **************************************************************

Ops.Array.ArrayMath = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const inArray_0 = op.inArray("array 0"),
    NumberIn = op.inValueFloat("Number for math", 0.0),
    mathSelect = op.inSwitch("Math function", ["+", "-", "*", "/", "%", "min", "max"], "+"),
    outArray = op.outArray("Array result"),
    outArrayLength = op.outNumber("Array length");

let mathFunc;

let showingError = false;

let mathArray = [];

inArray_0.onChange = NumberIn.onChange = update;
mathSelect.onChange = onFilterChange;

onFilterChange();

inArray_0.onLinkChanged = () =>
{
    if (inArray_0) inArray_0.copyLinkedUiAttrib("stride", outArray);
};

function onFilterChange()
{
    let mathSelectValue = mathSelect.get();

    if (mathSelectValue === "+") mathFunc = function (a, b) { return a + b; };
    else if (mathSelectValue === "-") mathFunc = function (a, b) { return a - b; };
    else if (mathSelectValue === "*") mathFunc = function (a, b) { return a * b; };
    else if (mathSelectValue === "/") mathFunc = function (a, b) { return a / b; };
    else if (mathSelectValue === "%") mathFunc = function (a, b) { return a % b; };
    else if (mathSelectValue === "min") mathFunc = function (a, b) { return Math.min(a, b); };
    else if (mathSelectValue === "max") mathFunc = function (a, b) { return Math.max(a, b); };
    update();
    op.setUiAttrib({ "extendTitle": mathSelectValue });
}

function update()
{
    let array0 = inArray_0.get();

    mathArray.length = 0;

    if (!array0)
    {
        outArrayLength.set(0);
        outArray.set(null);
        return;
    }

    let num = NumberIn.get();
    mathArray.length = array0.length;

    let i = 0;

    for (i = 0; i < array0.length; i++)
    {
        mathArray[i] = mathFunc(array0[i], num);
    }

    outArray.set(null);
    outArray.set(mathArray);
    outArrayLength.set(mathArray.length);
}


};

Ops.Array.ArrayMath.prototype = new CABLES.Op();
CABLES.OPS["c7617717-3114-452f-9625-e4fefd841e88"]={f:Ops.Array.ArrayMath,objName:"Ops.Array.ArrayMath"};




// **************************************************************
// 
// Ops.Gl.TextureEffects.ImageCompose_v3
// 
// **************************************************************

Ops.Gl.TextureEffects.ImageCompose_v3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"imgcomp_frag":"IN vec2 texCoord;\nUNI vec4 bgColor;\nUNI sampler2D tex;\n\nvoid main()\n{\n\n    #ifndef USE_TEX\n        outColor=bgColor;\n    #endif\n    #ifdef USE_TEX\n        outColor=texture(tex,texCoord);\n    #endif\n\n\n\n}\n",};
const
    cgl = op.patch.cgl,
    render = op.inTrigger("Render"),
    inTex = op.inTexture("Base Texture"),
    inSize = op.inSwitch("Size", ["Auto", "Manual"], "Auto"),
    width = op.inValueInt("Width", 640),
    height = op.inValueInt("Height", 480),
    inFilter = op.inSwitch("Filter", ["nearest", "linear", "mipmap"], "linear"),
    inWrap = op.inValueSelect("Wrap", ["clamp to edge", "repeat", "mirrored repeat"], "repeat"),
    inPixel = op.inDropDown("Pixel Format", CGL.Texture.PIXELFORMATS, CGL.Texture.PFORMATSTR_RGBA8UB),

    r = op.inValueSlider("R", 0),
    g = op.inValueSlider("G", 0),
    b = op.inValueSlider("B", 0),
    a = op.inValueSlider("A", 0),

    trigger = op.outTrigger("Next"),
    texOut = op.outTexture("texture_out", CGL.Texture.getEmptyTexture(cgl)),
    outRatio = op.outNumber("Aspect Ratio"),
    outWidth = op.outNumber("Texture Width"),
    outHeight = op.outNumber("Texture Height");

op.setPortGroup("Texture Size", [inSize, width, height]);
op.setPortGroup("Texture Parameters", [inWrap, inFilter, inPixel]);

r.setUiAttribs({ "colorPick": true });
op.setPortGroup("Color", [r, g, b, a]);

const prevViewPort = [0, 0, 0, 0];
let effect = null;
let tex = null;
let reInitEffect = true;
let isFloatTex = false;
let copyShader = null;
let copyShaderTexUni = null;
let copyShaderRGBAUni = null;

inWrap.onChange =
    inFilter.onChange =
    inPixel.onChange = reInitLater;

inTex.onLinkChanged =
inSize.onChange = updateUi;

render.onTriggered =
    op.preRender = doRender;

updateUi();

function initEffect()
{
    if (effect)effect.delete();
    if (tex)tex.delete();

    effect = new CGL.TextureEffect(cgl, { "isFloatingPointTexture": getFloatingPoint() });

    tex = new CGL.Texture(cgl,
        {
            "name": "image_compose_v2_" + op.id,
            "isFloatingPointTexture": getFloatingPoint(),
            "filter": getFilter(),
            "wrap": getWrap(),
            "width": getWidth(),
            "height": getHeight()
        });

    effect.setSourceTexture(tex);

    outWidth.set(getWidth());
    outHeight.set(getHeight());
    outRatio.set(getWidth() / getHeight());

    texOut.set(CGL.Texture.getEmptyTexture(cgl));

    reInitEffect = false;
    updateUi();
}

function getFilter()
{
    if (inFilter.get() == "nearest") return CGL.Texture.FILTER_NEAREST;
    else if (inFilter.get() == "linear") return CGL.Texture.FILTER_LINEAR;
    else if (inFilter.get() == "mipmap") return CGL.Texture.FILTER_MIPMAP;
}

function getWrap()
{
    if (inWrap.get() == "repeat") return CGL.Texture.WRAP_REPEAT;
    else if (inWrap.get() == "mirrored repeat") return CGL.Texture.WRAP_MIRRORED_REPEAT;
    else if (inWrap.get() == "clamp to edge") return CGL.Texture.WRAP_CLAMP_TO_EDGE;
}

function getFloatingPoint()
{
    isFloatTex = inPixel.get() == CGL.Texture.PFORMATSTR_RGBA32F;
    return isFloatTex;
}

function getWidth()
{
    if (inTex.get() && inSize.get() == "Auto") return inTex.get().width;
    if (inSize.get() == "Auto") return cgl.getViewPort()[2];
    return Math.ceil(width.get());
}

function getHeight()
{
    if (inTex.get() && inSize.get() == "Auto") return inTex.get().height;
    else if (inSize.get() == "Auto") return cgl.getViewPort()[3];
    else return Math.ceil(height.get());
}

function reInitLater()
{
    reInitEffect = true;
}

function updateResolution()
{
    if ((
        getWidth() != tex.width ||
        getHeight() != tex.height ||
        tex.isFloatingPoint() != getFloatingPoint() ||
        tex.filter != getFilter() ||
        tex.wrap != getWrap()
    ) && (getWidth() !== 0 && getHeight() !== 0))
    {
        initEffect();
        effect.setSourceTexture(tex);
        texOut.set(CGL.Texture.getEmptyTexture(cgl));
        texOut.set(tex);
        updateResolutionInfo();
    }
}

function updateResolutionInfo()
{
    let info = null;

    if (inSize.get() == "Manual")
    {
        info = null;
    }
    else if (inSize.get() == "Auto")
    {
        if (inTex.get()) info = "Input Texture";
        else info = "Canvas Size";

        info += ": " + getWidth() + " x " + getHeight();
    }

    let changed = false;
    changed = inSize.uiAttribs.info != info;
    inSize.setUiAttribs({ "info": info });
    if (changed)op.refreshParams();
}

function updateDefines()
{
    if (copyShader)copyShader.toggleDefine("USE_TEX", inTex.isLinked());
}

function updateUi()
{
    r.setUiAttribs({ "greyout": inTex.isLinked() });
    b.setUiAttribs({ "greyout": inTex.isLinked() });
    g.setUiAttribs({ "greyout": inTex.isLinked() });
    a.setUiAttribs({ "greyout": inTex.isLinked() });

    width.setUiAttribs({ "greyout": inSize.get() == "Auto" });
    height.setUiAttribs({ "greyout": inSize.get() == "Auto" });

    width.setUiAttribs({ "hideParam": inSize.get() != "Manual" });
    height.setUiAttribs({ "hideParam": inSize.get() != "Manual" });

    if (tex)
        if (getFloatingPoint() && getFilter() == CGL.Texture.FILTER_MIPMAP) op.setUiError("fpmipmap", "Don't use mipmap and 32bit at the same time, many systems do not support this.");
        else op.setUiError("fpmipmap", null);

    updateResolutionInfo();
    updateDefines();
}

op.preRender = () =>
{
    doRender();
};

function copyTexture()
{
    if (!copyShader)
    {
        copyShader = new CGL.Shader(cgl, "copytextureshader");
        copyShader.setSource(copyShader.getDefaultVertexShader(), attachments.imgcomp_frag);
        copyShaderTexUni = new CGL.Uniform(copyShader, "t", "tex", 0);
        copyShaderRGBAUni = new CGL.Uniform(copyShader, "4f", "bgColor", r, g, b, a);
        updateDefines();
    }

    cgl.pushShader(copyShader);
    cgl.currentTextureEffect.bind();

    if (inTex.get()) cgl.setTexture(0, inTex.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();
}

function doRender()
{
    if (!effect || reInitEffect) initEffect();

    const vp = cgl.getViewPort();
    prevViewPort[0] = vp[0];
    prevViewPort[1] = vp[1];
    prevViewPort[2] = vp[2];
    prevViewPort[3] = vp[3];

    cgl.pushBlend(false);

    updateResolution();

    const oldEffect = cgl.currentTextureEffect;
    cgl.currentTextureEffect = effect;
    cgl.currentTextureEffect.imgCompVer = 3;
    cgl.currentTextureEffect.width = width.get();
    cgl.currentTextureEffect.height = height.get();
    effect.setSourceTexture(tex);

    effect.startEffect(inTex.get() || CGL.Texture.getEmptyTexture(cgl, isFloatTex), true);
    copyTexture();

    trigger.trigger();

    texOut.set(CGL.Texture.getEmptyTexture(cgl));

    texOut.set(effect.getCurrentSourceTexture());

    effect.endEffect();

    cgl.setViewPort(prevViewPort[0], prevViewPort[1], prevViewPort[2], prevViewPort[3]);

    cgl.popBlend(false);
    cgl.currentTextureEffect = oldEffect;
}


};

Ops.Gl.TextureEffects.ImageCompose_v3.prototype = new CABLES.Op();
CABLES.OPS["e890a050-11b7-456e-b09b-d08cd9c1ee41"]={f:Ops.Gl.TextureEffects.ImageCompose_v3,objName:"Ops.Gl.TextureEffects.ImageCompose_v3"};




// **************************************************************
// 
// Ops.Gl.TextureEffects.Noise.PerlinNoise_v2
// 
// **************************************************************

Ops.Gl.TextureEffects.Noise.PerlinNoise_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"perlinnoise3d_frag":"UNI float z;\nUNI float x;\nUNI float y;\nUNI float scale;\nUNI float rangeMul;\nUNI float harmonics;\nUNI float aspect;\n\nIN vec2 texCoord;\nUNI sampler2D tex;\n\n#ifdef HAS_TEX_OFFSETMAP\n    UNI sampler2D texOffsetZ;\n    UNI float offMul;\n#endif\n\n#ifdef HAS_TEX_MASK\n    UNI sampler2D texMask;\n#endif\n\nUNI float amount;\n\n{{CGL.BLENDMODES3}}\n\n\nfloat Interpolation_C2( float x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }   //  6x^5-15x^4+10x^3\t( Quintic Curve.  As used by Perlin in Improved Noise.  http://mrl.nyu.edu/~perlin/paper445.pdf )\nvec2 Interpolation_C2( vec2 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec3 Interpolation_C2( vec3 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec4 Interpolation_C2( vec4 x ) { return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }\nvec4 Interpolation_C2_InterpAndDeriv( vec2 x ) { return x.xyxy * x.xyxy * ( x.xyxy * ( x.xyxy * ( x.xyxy * vec2( 6.0, 0.0 ).xxyy + vec2( -15.0, 30.0 ).xxyy ) + vec2( 10.0, -60.0 ).xxyy ) + vec2( 0.0, 30.0 ).xxyy ); }\nvec3 Interpolation_C2_Deriv( vec3 x ) { return x * x * (x * (x * 30.0 - 60.0) + 30.0); }\n\n\nvoid FAST32_hash_3D( vec3 gridcell, out vec4 lowz_hash, out vec4 highz_hash )\t//\tgenerates a random number for each of the 8 cell corners\n{\n    //    gridcell is assumed to be an integer coordinate\n\n    //\tTODO: \tthese constants need tweaked to find the best possible noise.\n    //\t\t\tprobably requires some kind of brute force computational searching or something....\n    const vec2 OFFSET = vec2( 50.0, 161.0 );\n    const float DOMAIN = 69.0;\n    const float SOMELARGEFLOAT = 635.298681;\n    const float ZINC = 48.500388;\n\n    //\ttruncate the domain\n    gridcell.xyz = gridcell.xyz - floor(gridcell.xyz * ( 1.0 / DOMAIN )) * DOMAIN;\n    vec3 gridcell_inc1 = step( gridcell, vec3( DOMAIN - 1.5 ) ) * ( gridcell + 1.0 );\n\n    //\tcalculate the noise\n    vec4 P = vec4( gridcell.xy, gridcell_inc1.xy ) + OFFSET.xyxy;\n    P *= P;\n    P = P.xzxz * P.yyww;\n    highz_hash.xy = vec2( 1.0 / ( SOMELARGEFLOAT + vec2( gridcell.z, gridcell_inc1.z ) * ZINC ) );\n    lowz_hash = fract( P * highz_hash.xxxx );\n    highz_hash = fract( P * highz_hash.yyyy );\n}\n\n\n\n\nvoid FAST32_hash_3D( \tvec3 gridcell,\n                        out vec4 lowz_hash_0,\n                        out vec4 lowz_hash_1,\n                        out vec4 lowz_hash_2,\n                        out vec4 highz_hash_0,\n                        out vec4 highz_hash_1,\n                        out vec4 highz_hash_2\t)\t\t//\tgenerates 3 random numbers for each of the 8 cell corners\n{\n    //    gridcell is assumed to be an integer coordinate\n\n    //\tTODO: \tthese constants need tweaked to find the best possible noise.\n    //\t\t\tprobably requires some kind of brute force computational searching or something....\n    const vec2 OFFSET = vec2( 50.0, 161.0 );\n    const float DOMAIN = 69.0;\n    const vec3 SOMELARGEFLOATS = vec3( 635.298681, 682.357502, 668.926525 );\n    const vec3 ZINC = vec3( 48.500388, 65.294118, 63.934599 );\n\n    //\ttruncate the domain\n    gridcell.xyz = gridcell.xyz - floor(gridcell.xyz * ( 1.0 / DOMAIN )) * DOMAIN;\n    vec3 gridcell_inc1 = step( gridcell, vec3( DOMAIN - 1.5 ) ) * ( gridcell + 1.0 );\n\n    //\tcalculate the noise\n    vec4 P = vec4( gridcell.xy, gridcell_inc1.xy ) + OFFSET.xyxy;\n    P *= P;\n    P = P.xzxz * P.yyww;\n    vec3 lowz_mod = vec3( 1.0 / ( SOMELARGEFLOATS.xyz + gridcell.zzz * ZINC.xyz ) );\n    vec3 highz_mod = vec3( 1.0 / ( SOMELARGEFLOATS.xyz + gridcell_inc1.zzz * ZINC.xyz ) );\n    lowz_hash_0 = fract( P * lowz_mod.xxxx );\n    highz_hash_0 = fract( P * highz_mod.xxxx );\n    lowz_hash_1 = fract( P * lowz_mod.yyyy );\n    highz_hash_1 = fract( P * highz_mod.yyyy );\n    lowz_hash_2 = fract( P * lowz_mod.zzzz );\n    highz_hash_2 = fract( P * highz_mod.zzzz );\n}\nfloat Falloff_Xsq_C1( float xsq ) { xsq = 1.0 - xsq; return xsq*xsq; }\t// ( 1.0 - x*x )^2   ( Used by Humus for lighting falloff in Just Cause 2.  GPUPro 1 )\nfloat Falloff_Xsq_C2( float xsq ) { xsq = 1.0 - xsq; return xsq*xsq*xsq; }\t// ( 1.0 - x*x )^3.   NOTE: 2nd derivative is 0.0 at x=1.0, but non-zero at x=0.0\nvec4 Falloff_Xsq_C2( vec4 xsq ) { xsq = 1.0 - xsq; return xsq*xsq*xsq; }\n\n\n//\n//\tPerlin Noise 3D  ( gradient noise )\n//\tReturn value range of -1.0->1.0\n//\thttp://briansharpe.files.wordpress.com/2011/11/perlinsample.jpg\n//\nfloat Perlin3D( vec3 P )\n{\n    //\testablish our grid cell and unit position\n    vec3 Pi = floor(P);\n    vec3 Pf = P - Pi;\n    vec3 Pf_min1 = Pf - 1.0;\n\n#if 1\n    //\n    //\tclassic noise.\n    //\trequires 3 random values per point.  with an efficent hash function will run faster than improved noise\n    //\n\n    //\tcalculate the hash.\n    //\t( various hashing methods listed in order of speed )\n    vec4 hashx0, hashy0, hashz0, hashx1, hashy1, hashz1;\n    FAST32_hash_3D( Pi, hashx0, hashy0, hashz0, hashx1, hashy1, hashz1 );\n    //SGPP_hash_3D( Pi, hashx0, hashy0, hashz0, hashx1, hashy1, hashz1 );\n\n    //\tcalculate the gradients\n    vec4 grad_x0 = hashx0 - 0.49999;\n    vec4 grad_y0 = hashy0 - 0.49999;\n    vec4 grad_z0 = hashz0 - 0.49999;\n    vec4 grad_x1 = hashx1 - 0.49999;\n    vec4 grad_y1 = hashy1 - 0.49999;\n    vec4 grad_z1 = hashz1 - 0.49999;\n    vec4 grad_results_0 = inversesqrt( grad_x0 * grad_x0 + grad_y0 * grad_y0 + grad_z0 * grad_z0 ) * ( vec2( Pf.x, Pf_min1.x ).xyxy * grad_x0 + vec2( Pf.y, Pf_min1.y ).xxyy * grad_y0 + Pf.zzzz * grad_z0 );\n    vec4 grad_results_1 = inversesqrt( grad_x1 * grad_x1 + grad_y1 * grad_y1 + grad_z1 * grad_z1 ) * ( vec2( Pf.x, Pf_min1.x ).xyxy * grad_x1 + vec2( Pf.y, Pf_min1.y ).xxyy * grad_y1 + Pf_min1.zzzz * grad_z1 );\n\n#if 1\n    //\tClassic Perlin Interpolation\n    vec3 blend = Interpolation_C2( Pf );\n    vec4 res0 = mix( grad_results_0, grad_results_1, blend.z );\n    vec4 blend2 = vec4( blend.xy, vec2( 1.0 - blend.xy ) );\n    float final = dot( res0, blend2.zxzx * blend2.wwyy );\n    final *= 1.1547005383792515290182975610039;\t\t//\t(optionally) scale things to a strict -1.0->1.0 range    *= 1.0/sqrt(0.75)\n    return final;\n#else\n    //\tClassic Perlin Surflet\n    //\thttp://briansharpe.wordpress.com/2012/03/09/modifications-to-classic-perlin-noise/\n    Pf *= Pf;\n    Pf_min1 *= Pf_min1;\n    vec4 vecs_len_sq = vec4( Pf.x, Pf_min1.x, Pf.x, Pf_min1.x ) + vec4( Pf.yy, Pf_min1.yy );\n    float final = dot( Falloff_Xsq_C2( min( vec4( 1.0 ), vecs_len_sq + Pf.zzzz ) ), grad_results_0 ) + dot( Falloff_Xsq_C2( min( vec4( 1.0 ), vecs_len_sq + Pf_min1.zzzz ) ), grad_results_1 );\n    final *= 2.3703703703703703703703703703704;\t\t//\t(optionally) scale things to a strict -1.0->1.0 range    *= 1.0/cube(0.75)\n    return final;\n#endif\n\n#else\n    //\n    //\timproved noise.\n    //\trequires 1 random value per point.  Will run faster than classic noise if a slow hashing function is used\n    //\n\n    //\tcalculate the hash.\n    //\t( various hashing methods listed in order of speed )\n    vec4 hash_lowz, hash_highz;\n    FAST32_hash_3D( Pi, hash_lowz, hash_highz );\n    //BBS_hash_3D( Pi, hash_lowz, hash_highz );\n    //SGPP_hash_3D( Pi, hash_lowz, hash_highz );\n\n    //\n    //\t\"improved\" noise using 8 corner gradients.  Faster than the 12 mid-edge point method.\n    //\tKen mentions using diagonals like this can cause \"clumping\", but we'll live with that.\n    //\t[1,1,1]  [-1,1,1]  [1,-1,1]  [-1,-1,1]\n    //\t[1,1,-1] [-1,1,-1] [1,-1,-1] [-1,-1,-1]\n    //\n    hash_lowz -= 0.5;\n    vec4 grad_results_0_0 = vec2( Pf.x, Pf_min1.x ).xyxy * sign( hash_lowz );\n    hash_lowz = abs( hash_lowz ) - 0.25;\n    vec4 grad_results_0_1 = vec2( Pf.y, Pf_min1.y ).xxyy * sign( hash_lowz );\n    vec4 grad_results_0_2 = Pf.zzzz * sign( abs( hash_lowz ) - 0.125 );\n    vec4 grad_results_0 = grad_results_0_0 + grad_results_0_1 + grad_results_0_2;\n\n    hash_highz -= 0.5;\n    vec4 grad_results_1_0 = vec2( Pf.x, Pf_min1.x ).xyxy * sign( hash_highz );\n    hash_highz = abs( hash_highz ) - 0.25;\n    vec4 grad_results_1_1 = vec2( Pf.y, Pf_min1.y ).xxyy * sign( hash_highz );\n    vec4 grad_results_1_2 = Pf_min1.zzzz * sign( abs( hash_highz ) - 0.125 );\n    vec4 grad_results_1 = grad_results_1_0 + grad_results_1_1 + grad_results_1_2;\n\n    //\tblend the gradients and return\n    vec3 blend = Interpolation_C2( Pf );\n    vec4 res0 = mix( grad_results_0, grad_results_1, blend.z );\n    vec4 blend2 = vec4( blend.xy, vec2( 1.0 - blend.xy ) );\n    return dot( res0, blend2.zxzx * blend2.wwyy ) * (2.0 / 3.0);\t//\t(optionally) mult by (2.0/3.0) to scale to a strict -1.0->1.0 range\n#endif\n}\n\nvoid main()\n{\n    vec4 base=texture(tex,texCoord);\n    vec2 p=vec2(texCoord.x-0.5,texCoord.y-0.5);\n\n    p=p*scale;\n    p=vec2(p.x+0.5-x,p.y+0.5-y);\n\n\n\n    vec3 offset;\n    #ifdef HAS_TEX_OFFSETMAP\n        vec4 offMap=texture(texOffsetZ,texCoord);\n\n        #ifdef OFFSET_X_R\n            offset.x=offMap.r;\n        #endif\n        #ifdef OFFSET_X_G\n            offset.x=offMap.g;\n        #endif\n        #ifdef OFFSET_X_B\n            offset.x=offMap.b;\n        #endif\n\n        #ifdef OFFSET_Y_R\n            offset.y=offMap.r;\n        #endif\n        #ifdef OFFSET_Y_G\n            offset.y=offMap.g;\n        #endif\n        #ifdef OFFSET_Y_B\n            offset.y=offMap.b;\n        #endif\n\n        #ifdef OFFSET_Z_R\n            offset.z=offMap.r;\n        #endif\n        #ifdef OFFSET_Z_G\n            offset.z=offMap.g;\n        #endif\n        #ifdef OFFSET_Z_B\n            offset.z=offMap.b;\n        #endif\n        offset*=offMul;\n    #endif\n\n    float aa=texture(tex,texCoord).r;\n\n    float v = 0.0;\n    p.x*=aspect;\n\n    v+=Perlin3D(vec3(p.x,p.y,z)+offset);\n\n    #ifdef HARMONICS\n        if (harmonics >= 2.0) v += Perlin3D(vec3(p.x,p.y,z)*2.2+offset) * 0.5;\n        if (harmonics >= 3.0) v += Perlin3D(vec3(p.x,p.y,z)*4.3+offset) * 0.25;\n        if (harmonics >= 4.0) v += Perlin3D(vec3(p.x,p.y,z)*8.4+offset) * 0.125;\n        if (harmonics >= 5.0) v += Perlin3D(vec3(p.x,p.y,z)*16.5+offset) * 0.0625;\n    #endif\n\n\n    v*=rangeMul;\n    v=v*0.5+0.5;\n    float v2=v;\n    float v3=v;\n\n    #ifdef RGB\n        v2=Perlin3D(vec3(p.x+2.0,p.y+2.0,z))*0.5+0.5;\n\n        #ifdef HARMONICS\n            if (harmonics >= 2.0) v2 += Perlin3D(vec3(p.x,p.y,z)*2.2+offset) * 0.5;\n            if (harmonics >= 3.0) v2 += Perlin3D(vec3(p.x,p.y,z)*4.3+offset) * 0.25;\n            if (harmonics >= 4.0) v2 += Perlin3D(vec3(p.x,p.y,z)*8.4+offset) * 0.125;\n            if (harmonics >= 5.0) v2 += Perlin3D(vec3(p.x,p.y,z)*16.5+offset) * 0.0625;\n        #endif\n\n        v3=Perlin3D(vec3(p.x+3.0,p.y+3.0,z))*0.5+0.5;\n\n        #ifdef HARMONICS\n            if (harmonics >= 2.0) v3 += Perlin3D(vec3(p.x,p.y,z)*2.2+offset) * 0.5;\n            if (harmonics >= 3.0) v3 += Perlin3D(vec3(p.x,p.y,z)*4.3+offset) * 0.25;\n            if (harmonics >= 4.0) v3 += Perlin3D(vec3(p.x,p.y,z)*8.4+offset) * 0.125;\n            if (harmonics >= 5.0) v3 += Perlin3D(vec3(p.x,p.y,z)*16.5+offset) * 0.0625;\n        #endif\n\n    #endif\n\n    vec4 col=vec4(v,v2,v3,1.0);\n\n    float str=1.0;\n    #ifdef HAS_TEX_MASK\n        str=texture(texMask,texCoord).r;\n    #endif\n\n    col=cgl_blendPixel(base,col,amount*str);\n\n\n    #ifdef NO_CHANNEL_R\n        col.r=base.r;\n    #endif\n    #ifdef NO_CHANNEL_G\n        col.g=base.g;\n    #endif\n    #ifdef NO_CHANNEL_B\n        col.b=base.b;\n    #endif\n\n\n\n    outColor=col;\n}\n",};
const
    render = op.inTrigger("render"),
    inTexMask = op.inTexture("Mask"),
    blendMode = CGL.TextureEffect.AddBlendSelect(op),
    maskAlpha = CGL.TextureEffect.AddBlendAlphaMask(op),
    amount = op.inValueSlider("Amount", 1),
    inMode = op.inSwitch("Color", ["Mono", "RGB", "R", "G", "B"], "Mono"),
    scale = op.inValue("Scale", 8),
    rangeMul = op.inValue("Multiply", 1),
    inHarmonics = op.inSwitch("Harmonics", ["1", "2", "3", "4", "5"], "1"),
    x = op.inValue("X", 0),
    y = op.inValue("Y", 0),
    z = op.inValue("Z", 0),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
const shader = new CGL.Shader(cgl, "perlinnoise");

op.setPortGroup("Position", [x, y, z]);

shader.setSource(shader.getDefaultVertexShader(), attachments.perlinnoise3d_frag);

const
    textureUniform = new CGL.Uniform(shader, "t", "tex", 0),
    textureUniformOffZ = new CGL.Uniform(shader, "t", "texOffsetZ", 1),
    textureUniformMask = new CGL.Uniform(shader, "t", "texMask", 2),

    uniZ = new CGL.Uniform(shader, "f", "z", z),
    uniX = new CGL.Uniform(shader, "f", "x", x),
    uniY = new CGL.Uniform(shader, "f", "y", y),
    uniScale = new CGL.Uniform(shader, "f", "scale", scale),
    amountUniform = new CGL.Uniform(shader, "f", "amount", amount),
    rangeMulUniform = new CGL.Uniform(shader, "f", "rangeMul", rangeMul);

CGL.TextureEffect.setupBlending(op, shader, blendMode, amount, maskAlpha);

// offsetMap

const
    inTexOffsetZ = op.inTexture("Offset"),
    inOffsetMul = op.inFloat("Offset Multiply", 1),
    offsetX = op.inSwitch("Offset X", ["None", "R", "G", "B"], "None"),
    offsetY = op.inSwitch("Offset Y", ["None", "R", "G", "B"], "None"),
    offsetZ = op.inSwitch("Offset Z", ["None", "R", "G", "B"], "R");

op.setPortGroup("Offset Map", [inTexOffsetZ, offsetZ, offsetY, offsetX, inOffsetMul]);

const uniOffMul = new CGL.Uniform(shader, "f", "offMul", inOffsetMul);

const uniAspect = new CGL.Uniform(shader, "f", "aspect", 1);
const uniHarmonics = new CGL.Uniform(shader, "f", "harmonics", 0);

inHarmonics.onChange = () =>
{
    uniHarmonics.setValue(parseFloat(inHarmonics.get()));
    shader.toggleDefine("HARMONICS", inHarmonics.get() > 1);
};

offsetX.onChange =
offsetY.onChange =
offsetZ.onChange =
inTexMask.onChange =
inMode.onChange =
inTexOffsetZ.onChange = updateDefines;
updateDefines();

function updateDefines()
{
    shader.toggleDefine("NO_CHANNEL_R", inMode.get() == "G" || inMode.get() == "B");
    shader.toggleDefine("NO_CHANNEL_G", inMode.get() == "R" || inMode.get() == "B");
    shader.toggleDefine("NO_CHANNEL_B", inMode.get() == "R" || inMode.get() == "G");

    shader.toggleDefine("HAS_TEX_OFFSETMAP", inTexOffsetZ.get());
    shader.toggleDefine("HAS_TEX_MASK", inTexMask.get());

    shader.toggleDefine("OFFSET_X_R", offsetX.get() == "R");
    shader.toggleDefine("OFFSET_X_G", offsetX.get() == "G");
    shader.toggleDefine("OFFSET_X_B", offsetX.get() == "B");

    shader.toggleDefine("OFFSET_Y_R", offsetY.get() == "R");
    shader.toggleDefine("OFFSET_Y_G", offsetY.get() == "G");
    shader.toggleDefine("OFFSET_Y_B", offsetY.get() == "B");

    shader.toggleDefine("OFFSET_Z_R", offsetZ.get() == "R");
    shader.toggleDefine("OFFSET_Z_G", offsetZ.get() == "G");
    shader.toggleDefine("OFFSET_Z_B", offsetZ.get() == "B");

    offsetX.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    offsetY.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    offsetZ.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });
    inOffsetMul.setUiAttribs({ "greyout": !inTexOffsetZ.isLinked() });

    shader.toggleDefine("RGB", inMode.get() == "RGB");
}

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op, 3)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    uniAspect.setValue(cgl.currentTextureEffect.aspectRatio);

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);
    if (inTexOffsetZ.get()) cgl.setTexture(1, inTexOffsetZ.get().tex);
    if (inTexMask.get()) cgl.setTexture(2, inTexMask.get().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.TextureEffects.Noise.PerlinNoise_v2.prototype = new CABLES.Op();
CABLES.OPS["b4b238d3-db68-4206-8dc7-4b52433fc932"]={f:Ops.Gl.TextureEffects.Noise.PerlinNoise_v2,objName:"Ops.Gl.TextureEffects.Noise.PerlinNoise_v2"};




// **************************************************************
// 
// Ops.Anim.Timer_v2
// 
// **************************************************************

Ops.Anim.Timer_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    inSpeed = op.inValue("Speed", 1),
    playPause = op.inValueBool("Play", true),
    reset = op.inTriggerButton("Reset"),
    inSyncTimeline = op.inValueBool("Sync to timeline", false),
    outTime = op.outNumber("Time");

op.setPortGroup("Controls", [playPause, reset, inSpeed]);

const timer = new CABLES.Timer();
let lastTime = null;
let time = 0;
let syncTimeline = false;

playPause.onChange = setState;
setState();

function setState()
{
    if (playPause.get())
    {
        timer.play();
        op.patch.addOnAnimFrame(op);
    }
    else
    {
        timer.pause();
        op.patch.removeOnAnimFrame(op);
    }
}

reset.onTriggered = doReset;

function doReset()
{
    time = 0;
    lastTime = null;
    timer.setTime(0);
    outTime.set(0);
}

inSyncTimeline.onChange = function ()
{
    syncTimeline = inSyncTimeline.get();
    playPause.setUiAttribs({ "greyout": syncTimeline });
    reset.setUiAttribs({ "greyout": syncTimeline });
};

op.onAnimFrame = function (tt)
{
    if (timer.isPlaying())
    {
        if (CABLES.overwriteTime !== undefined)
        {
            outTime.set(CABLES.overwriteTime * inSpeed.get());
        }
        else

        if (syncTimeline)
        {
            outTime.set(tt * inSpeed.get());
        }
        else
        {
            timer.update();
            const timerVal = timer.get();

            if (lastTime === null)
            {
                lastTime = timerVal;
                return;
            }

            const t = Math.abs(timerVal - lastTime);
            lastTime = timerVal;

            time += t * inSpeed.get();
            if (time != time)time = 0;
            outTime.set(time);
        }
    }
};


};

Ops.Anim.Timer_v2.prototype = new CABLES.Op();
CABLES.OPS["aac7f721-208f-411a-adb3-79adae2e471a"]={f:Ops.Anim.Timer_v2,objName:"Ops.Anim.Timer_v2"};




// **************************************************************
// 
// Ops.Time.DelayedTrigger
// 
// **************************************************************

Ops.Time.DelayedTrigger = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    delay = op.inValueFloat("delay", 1),
    cancel = op.inTriggerButton("Cancel"),
    next = op.outTrigger("next"),
    outDelaying = op.outBool("Delaying");

let lastTimeout = null;

cancel.onTriggered = function ()
{
    if (lastTimeout)clearTimeout(lastTimeout);
    lastTimeout = null;
};

exe.onTriggered = function ()
{
    outDelaying.set(true);
    if (lastTimeout)clearTimeout(lastTimeout);

    lastTimeout = setTimeout(
        function ()
        {
            outDelaying.set(false);
            lastTimeout = null;
            next.trigger();
        },
        delay.get() * 1000);
};


};

Ops.Time.DelayedTrigger.prototype = new CABLES.Op();
CABLES.OPS["f4ff66b0-8500-46f7-9117-832aea0c2750"]={f:Ops.Time.DelayedTrigger,objName:"Ops.Time.DelayedTrigger"};




// **************************************************************
// 
// Ops.Patch.LoadingStatus_v2
// 
// **************************************************************

Ops.Patch.LoadingStatus_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    preRenderOps = op.inValueBool("PreRender Ops"),
    startTimeLine = op.inBool("Play Timeline", true),

    next = op.outTrigger("Next"),
    outInitialFinished = op.outBool("Finished Initial Loading", false),
    outLoading = op.outBool("Loading"),
    outProgress = op.outNumber("Progress"),
    outList = op.outArray("Jobs"),
    loadingFinished = op.outTrigger("Trigger Loading Finished ");

const cgl = op.patch.cgl;
const patch = op.patch;

let finishedOnce = false;
const preRenderTimes = [];
let firstTime = true;

document.body.classList.add("cables-loading");

let loadingId = cgl.patch.loading.start("loadingStatusInit", "loadingStatusInit");

exe.onTriggered = () =>
{
    const jobs = op.patch.loading.getListJobs();
    outProgress.set(patch.loading.getProgress());

    let hasFinished = jobs.length === 0;
    const notFinished = !hasFinished;
    // outLoading.set(!hasFinished);

    if (notFinished)
    {
        outList.set(op.patch.loading.getListJobs());
    }

    if (notFinished)
    {
        if (firstTime)
        {
            if (preRenderOps.get()) op.patch.preRenderOps();
            op.patch.timer.setTime(0);
            if (startTimeLine.get())
            {
                op.patch.timer.play();
            }
            else
            {
                op.patch.timer.pause();
            }
        }
        firstTime = false;

        document.body.classList.remove("cables-loading");
        document.body.classList.add("cables-loaded");
    }
    else
    {
        finishedOnce = true;
        outList.set(op.patch.loading.getListJobs());

        if (patch.loading.getProgress() < 1.0)
        {
            op.patch.timer.setTime(0);
            op.patch.timer.pause();
        }
    }

    outInitialFinished.set(finishedOnce);

    if (outLoading.get() && hasFinished) loadingFinished.trigger();

    outLoading.set(notFinished);

    next.trigger();

    if (loadingId)
    {
        cgl.patch.loading.finished(loadingId);
        loadingId = null;
    }
};


};

Ops.Patch.LoadingStatus_v2.prototype = new CABLES.Op();
CABLES.OPS["e62f7f4c-7436-437e-8451-6bc3c28545f7"]={f:Ops.Patch.LoadingStatus_v2,objName:"Ops.Patch.LoadingStatus_v2"};




// **************************************************************
// 
// Ops.Html.ScrollPosition
// 
// **************************************************************

Ops.Html.ScrollPosition = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const sleft = op.addOutPort(new CABLES.Port(op, "left"));
const stop = op.addOutPort(new CABLES.Port(op, "top"));

document.addEventListener("scroll", updateScroll);
updateScroll();

function updateScroll()
{
    sleft.set((window.pageXOffset !== undefined) ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft);
    stop.set((window.pageYOffset !== undefined) ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop);
}


};

Ops.Html.ScrollPosition.prototype = new CABLES.Op();
CABLES.OPS["1bc6bbfa-9574-40ef-8eb0-f045d88f828d"]={f:Ops.Html.ScrollPosition,objName:"Ops.Html.ScrollPosition"};




// **************************************************************
// 
// Ops.String.NumberToString_v2
// 
// **************************************************************

Ops.String.NumberToString_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    val = op.inValue("Number"),
    result = op.outString("Result");

val.onChange = update;
update();

function update()
{
    result.set(String(val.get() || 0));
}


};

Ops.String.NumberToString_v2.prototype = new CABLES.Op();
CABLES.OPS["5c6d375a-82db-4366-8013-93f56b4061a9"]={f:Ops.String.NumberToString_v2,objName:"Ops.String.NumberToString_v2"};




// **************************************************************
// 
// Ops.Gl.Matrix.Transform
// 
// **************************************************************

Ops.Gl.Matrix.Transform = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    render = op.inTrigger("render"),
    posX = op.inValue("posX", 0),
    posY = op.inValue("posY", 0),
    posZ = op.inValue("posZ", 0),
    scale = op.inValue("scale", 1),
    rotX = op.inValue("rotX", 0),
    rotY = op.inValue("rotY", 0),
    rotZ = op.inValue("rotZ", 0),
    trigger = op.outTrigger("trigger");

op.setPortGroup("Rotation", [rotX, rotY, rotZ]);
op.setPortGroup("Position", [posX, posY, posZ]);
op.setPortGroup("Scale", [scale]);
op.setUiAxisPorts(posX, posY, posZ);

const vPos = vec3.create();
const vScale = vec3.create();
const transMatrix = mat4.create();
mat4.identity(transMatrix);

let
    doScale = false,
    doTranslate = false,
    translationChanged = true,
    scaleChanged = true,
    rotChanged = true;

rotX.onChange = rotY.onChange = rotZ.onChange = setRotChanged;
posX.onChange = posY.onChange = posZ.onChange = setTranslateChanged;
scale.onChange = setScaleChanged;

render.onTriggered = function ()
{
    // if(!CGL.TextureEffect.checkOpNotInTextureEffect(op)) return;

    let updateMatrix = false;
    if (translationChanged)
    {
        updateTranslation();
        updateMatrix = true;
    }
    if (scaleChanged)
    {
        updateScale();
        updateMatrix = true;
    }
    if (rotChanged) updateMatrix = true;

    if (updateMatrix) doUpdateMatrix();

    const cg = op.patch.cgl;
    cg.pushModelMatrix();
    mat4.multiply(cg.mMatrix, cg.mMatrix, transMatrix);

    trigger.trigger();
    cg.popModelMatrix();

    if (CABLES.UI && CABLES.UI.showCanvasTransforms) gui.setTransform(op.id, posX.get(), posY.get(), posZ.get());

    if (op.isCurrentUiOp())
        gui.setTransformGizmo(
            {
                "posX": posX,
                "posY": posY,
                "posZ": posZ,
            });
};

op.transform3d = function ()
{
    return { "pos": [posX, posY, posZ] };
};

function doUpdateMatrix()
{
    mat4.identity(transMatrix);
    if (doTranslate)mat4.translate(transMatrix, transMatrix, vPos);

    if (rotX.get() !== 0)mat4.rotateX(transMatrix, transMatrix, rotX.get() * CGL.DEG2RAD);
    if (rotY.get() !== 0)mat4.rotateY(transMatrix, transMatrix, rotY.get() * CGL.DEG2RAD);
    if (rotZ.get() !== 0)mat4.rotateZ(transMatrix, transMatrix, rotZ.get() * CGL.DEG2RAD);

    if (doScale)mat4.scale(transMatrix, transMatrix, vScale);
    rotChanged = false;
}

function updateTranslation()
{
    doTranslate = false;
    if (posX.get() !== 0.0 || posY.get() !== 0.0 || posZ.get() !== 0.0) doTranslate = true;
    vec3.set(vPos, posX.get(), posY.get(), posZ.get());
    translationChanged = false;
}

function updateScale()
{
    // doScale=false;
    // if(scale.get()!==0.0)
    doScale = true;
    vec3.set(vScale, scale.get(), scale.get(), scale.get());
    scaleChanged = false;
}

function setTranslateChanged()
{
    translationChanged = true;
}

function setScaleChanged()
{
    scaleChanged = true;
}

function setRotChanged()
{
    rotChanged = true;
}

doUpdateMatrix();


};

Ops.Gl.Matrix.Transform.prototype = new CABLES.Op();
CABLES.OPS["650baeb1-db2d-4781-9af6-ab4e9d4277be"]={f:Ops.Gl.Matrix.Transform,objName:"Ops.Gl.Matrix.Transform"};




// **************************************************************
// 
// Ops.Ui.VizNumber
// 
// **************************************************************

Ops.Ui.VizNumber = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const inNum = op.inFloat("Number", 0);
const outNum = op.outNumber("Result");

op.setUiAttrib({ "widthOnlyGrow": true });

inNum.onChange = () =>
{
    let n = inNum.get();
    if (op.patch.isEditorMode())
    {
        let str = "";
        if (n === null)str = "null";
        else if (n === undefined)str = "undefined";
        else
        {
            str = "" + Math.round(n * 10000) / 10000;

            if (str[0] != "-")str = " " + str;
        }

        op.setUiAttribs({ "extendTitle": str });
    }

    outNum.set(n);
};


};

Ops.Ui.VizNumber.prototype = new CABLES.Op();
CABLES.OPS["2b60d12d-2884-4ad0-bda4-0caeb6882f5c"]={f:Ops.Ui.VizNumber,objName:"Ops.Ui.VizNumber"};




// **************************************************************
// 
// Ops.Gl.Render2Texture
// 
// **************************************************************

Ops.Gl.Render2Texture = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const cgl = op.patch.cgl;

const
    render = op.inTrigger("render"),
    useVPSize = op.inValueBool("use viewport size", true),
    width = op.inValueInt("texture width", 512),
    height = op.inValueInt("texture height", 512),
    aspect = op.inBool("Auto Aspect", false),
    tfilter = op.inSwitch("filter", ["nearest", "linear", "mipmap"], "linear"),
    twrap = op.inSwitch("Wrap", ["Clamp", "Repeat", "Mirror"], "Repeat"),
    msaa = op.inSwitch("MSAA", ["none", "2x", "4x", "8x"], "none"),
    trigger = op.outTrigger("trigger"),
    tex = op.outTexture("texture"),
    texDepth = op.outTexture("textureDepth"),
    fpTexture = op.inValueBool("HDR"),
    depth = op.inValueBool("Depth", true),
    clear = op.inValueBool("Clear", true);

let fb = null;
let reInitFb = true;
tex.set(CGL.Texture.getEmptyTexture(cgl));

op.setPortGroup("Size", [useVPSize, width, height, aspect]);

const prevViewPort = [0, 0, 0, 0];

fpTexture.setUiAttribs({ "title": "Pixelformat Float 32bit" });

fpTexture.onChange =
    depth.onChange =
    clear.onChange =
    tfilter.onChange =
    twrap.onChange =
    msaa.onChange = initFbLater;

useVPSize.onChange = updateVpSize;

render.onTriggered =
    op.preRender = doRender;

updateVpSize();

function updateVpSize()
{
    width.setUiAttribs({ "greyout": useVPSize.get() });
    height.setUiAttribs({ "greyout": useVPSize.get() });
    aspect.setUiAttribs({ "greyout": useVPSize.get() });
}

function initFbLater()
{
    reInitFb = true;
}

function doRender()
{
    const vp = cgl.getViewPort();
    prevViewPort[0] = vp[0];
    prevViewPort[1] = vp[1];
    prevViewPort[2] = vp[2];
    prevViewPort[3] = vp[3];

    if (!fb || reInitFb)
    {
        if (fb) fb.delete();

        let selectedWrap = CGL.Texture.WRAP_REPEAT;
        if (twrap.get() == "Clamp") selectedWrap = CGL.Texture.WRAP_CLAMP_TO_EDGE;
        else if (twrap.get() == "Mirror") selectedWrap = CGL.Texture.WRAP_MIRRORED_REPEAT;

        let selectFilter = CGL.Texture.FILTER_NEAREST;
        if (tfilter.get() == "nearest") selectFilter = CGL.Texture.FILTER_NEAREST;
        else if (tfilter.get() == "linear") selectFilter = CGL.Texture.FILTER_LINEAR;
        else if (tfilter.get() == "mipmap") selectFilter = CGL.Texture.FILTER_MIPMAP;

        if (fpTexture.get() && tfilter.get() == "mipmap") op.setUiError("fpmipmap", "Don't use mipmap and HDR at the same time, many systems do not support this.");
        else op.setUiError("fpmipmap", null);

        if (cgl.glVersion >= 2)
        {
            let ms = true;
            let msSamples = 4;

            if (msaa.get() == "none")
            {
                msSamples = 0;
                ms = false;
            }
            if (msaa.get() == "2x") msSamples = 2;
            if (msaa.get() == "4x") msSamples = 4;
            if (msaa.get() == "8x") msSamples = 8;

            fb = new CGL.Framebuffer2(cgl, 8, 8,
                {
                    "name": "render2texture " + op.id,
                    "isFloatingPointTexture": fpTexture.get(),
                    "multisampling": ms,
                    "wrap": selectedWrap,
                    "filter": selectFilter,
                    "depth": depth.get(),
                    "multisamplingSamples": msSamples,
                    "clear": clear.get()
                });
        }
        else
        {
            fb = new CGL.Framebuffer(cgl, 8, 8, { "isFloatingPointTexture": fpTexture.get(), "clear": clear.get() });
        }

        texDepth.set(fb.getTextureDepth());
        reInitFb = false;
    }

    if (useVPSize.get())
    {
        width.set(cgl.getViewPort()[2]);
        height.set(cgl.getViewPort()[3]);
    }

    if (fb.getWidth() != Math.ceil(width.get()) || fb.getHeight() != Math.ceil(height.get()))
    {
        fb.setSize(
            Math.max(1, Math.ceil(width.get())),
            Math.max(1, Math.ceil(height.get())));
    }

    fb.renderStart(cgl);

    if (aspect.get()) mat4.perspective(cgl.pMatrix, 45, width.get() / height.get(), 0.1, 1000.0);

    trigger.trigger();
    fb.renderEnd(cgl);

    // cgl.resetViewPort();
    cgl.setViewPort(prevViewPort[0], prevViewPort[1], prevViewPort[2], prevViewPort[3]);

    tex.set(CGL.Texture.getEmptyTexture(op.patch.cgl));
    tex.set(fb.getTextureColor());
}


};

Ops.Gl.Render2Texture.prototype = new CABLES.Op();
CABLES.OPS["d01fa820-396c-4cb5-9d78-6b14762852af"]={f:Ops.Gl.Render2Texture,objName:"Ops.Gl.Render2Texture"};




// **************************************************************
// 
// Ops.Gl.TextureEffects.BrightnessContrast
// 
// **************************************************************

Ops.Gl.TextureEffects.BrightnessContrast = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"brightness_contrast_frag":"IN vec2 texCoord;\nUNI sampler2D tex;\nUNI float amount;\nUNI float amountbright;\n\nvoid main()\n{\n    vec4 col=vec4(1.0,0.0,0.0,1.0);\n    col=texture(tex,texCoord);\n\n    // apply contrast\n    col.rgb = ((col.rgb - 0.5) * max(amount*2.0, 0.0))+0.5;\n\n    // apply brightness\n    col.rgb *= amountbright*2.0;\n\n    outColor = col;\n}",};
const
    render = op.inTrigger("render"),
    amount = op.inValueSlider("contrast", 0.5),
    amountBright = op.inValueSlider("brightness", 0.5),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;

const shader = new CGL.Shader(cgl, "brightnesscontrast");
shader.setSource(shader.getDefaultVertexShader(), attachments.brightness_contrast_frag);
const textureUniform = new CGL.Uniform(shader, "t", "tex", 0);
const amountUniform = new CGL.Uniform(shader, "f", "amount", amount);
const amountBrightUniform = new CGL.Uniform(shader, "f", "amountbright", amountBright);

render.onTriggered = function ()
{
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    if (!cgl.currentTextureEffect.getCurrentSourceTexture()) return;
    if (!CGL.TextureEffect.checkOpInEffect(op)) return;

    cgl.pushShader(shader);
    cgl.currentTextureEffect.bind();

    cgl.setTexture(0, cgl.currentTextureEffect.getCurrentSourceTexture().tex);

    cgl.currentTextureEffect.finish();
    cgl.popShader();

    trigger.trigger();
};


};

Ops.Gl.TextureEffects.BrightnessContrast.prototype = new CABLES.Op();
CABLES.OPS["54b89199-c594-4dff-bc48-82d6c7a55e8a"]={f:Ops.Gl.TextureEffects.BrightnessContrast,objName:"Ops.Gl.TextureEffects.BrightnessContrast"};




// **************************************************************
// 
// Ops.Gl.Meshes.FullscreenRectangle
// 
// **************************************************************

Ops.Gl.Meshes.FullscreenRectangle = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"shader_frag":"UNI sampler2D tex;\nIN vec2 texCoord;\n\nvoid main()\n{\n    outColor= texture(tex,texCoord);\n}\n\n","shader_vert":"{{MODULES_HEAD}}\n\nIN vec3 vPosition;\nUNI mat4 projMatrix;\nUNI mat4 mvMatrix;\n\nOUT vec2 texCoord;\nIN vec2 attrTexCoord;\n\nvoid main()\n{\n   vec4 pos=vec4(vPosition,  1.0);\n\n   texCoord=vec2(attrTexCoord.x,(1.0-attrTexCoord.y));\n\n   gl_Position = projMatrix * mvMatrix * pos;\n}\n",};
const
    render = op.inTrigger("render"),
    inScale = op.inSwitch("Scale", ["Stretch", "Fit"], "Fit"),
    flipY = op.inValueBool("Flip Y"),
    flipX = op.inValueBool("Flip X"),
    inTexture = op.inTexture("Texture"),
    trigger = op.outTrigger("trigger");

const cgl = op.patch.cgl;
let mesh = null;
let geom = new CGL.Geometry("fullscreen rectangle");
let x = 0, y = 0, z = 0, w = 0, h = 0;

flipX.onChange = rebuildFlip;
flipY.onChange = rebuildFlip;
render.onTriggered = doRender;
inTexture.onLinkChanged = updateUi;
op.toWorkPortsNeedToBeLinked(render);

const shader = new CGL.Shader(cgl, "fullscreenrectangle");
shader.setModules(["MODULE_VERTEX_POSITION", "MODULE_COLOR", "MODULE_BEGIN_FRAG"]);

shader.setSource(attachments.shader_vert, attachments.shader_frag);
shader.fullscreenRectUniform = new CGL.Uniform(shader, "t", "tex", 0);
shader.aspectUni = new CGL.Uniform(shader, "f", "aspectTex", 0);

let useShader = false;
let updateShaderLater = true;
let fitImageAspect = false;
let oldVp = [];

updateUi();

inTexture.onChange = function ()
{
    updateShaderLater = true;
};

function updateUi()
{
    if (!CABLES.UI) return;
    flipY.setUiAttribs({ "greyout": !inTexture.isLinked() });
    flipX.setUiAttribs({ "greyout": !inTexture.isLinked() });
    inScale.setUiAttribs({ "greyout": !inTexture.isLinked() });
}

function updateShader()
{
    let tex = inTexture.get();
    if (tex) useShader = true;
    else useShader = false;
}

op.preRender = function ()
{
    updateShader();
    shader.bind();
    if (mesh)mesh.render(shader);
    doRender();
};

inScale.onChange = () =>
{
    fitImageAspect = inScale.get() == "Fit";
};

function doRender()
{
    if (cgl.getViewPort()[2] != w || cgl.getViewPort()[3] != h || !mesh) rebuild();

    if (updateShaderLater) updateShader();

    cgl.pushPMatrix();
    mat4.identity(cgl.pMatrix);
    mat4.ortho(cgl.pMatrix, 0, w, h, 0, -10.0, 1000);

    cgl.pushModelMatrix();
    mat4.identity(cgl.mMatrix);

    cgl.pushViewMatrix();
    mat4.identity(cgl.vMatrix);

    if (fitImageAspect && inTexture.get())
    {
        const rat = inTexture.get().width / inTexture.get().height;

        let _h = h;
        let _w = h * rat;

        if (_w > w)
        {
            _h = w * 1 / rat;
            _w = w;
        }

        oldVp[0] = cgl.getViewPort()[0];
        oldVp[1] = cgl.getViewPort()[1];
        oldVp[2] = cgl.getViewPort()[2];
        oldVp[3] = cgl.getViewPort()[3];

        cgl.setViewPort((w - _w) / 2, (h - _h) / 2, _w, _h);
        // cgl.gl.clear(cgl.gl.COLOR_BUFFER_BIT | cgl.gl.DEPTH_BUFFER_BIT);
    }

    if (useShader)
    {
        if (inTexture.get())
            cgl.setTexture(0, inTexture.get().tex);

        mesh.render(shader);
    }
    else
    {
        mesh.render(cgl.getShader());
    }

    cgl.gl.clear(cgl.gl.DEPTH_BUFFER_BIT);

    cgl.popPMatrix();
    cgl.popModelMatrix();
    cgl.popViewMatrix();

    if (fitImageAspect && inTexture.get())
        cgl.setViewPort(oldVp[0], oldVp[1], oldVp[2], oldVp[3]);

    trigger.trigger();
}

function rebuildFlip()
{
    mesh = null;
}

function rebuild()
{
    const currentViewPort = cgl.getViewPort();

    if (currentViewPort[2] == w && currentViewPort[3] == h && mesh) return;

    let xx = 0, xy = 0;

    w = currentViewPort[2];
    h = currentViewPort[3];

    geom.vertices = new Float32Array([
        xx + w, xy + h, 0.0,
        xx, xy + h, 0.0,
        xx + w, xy, 0.0,
        xx, xy, 0.0
    ]);

    let tc = null;

    if (flipY.get())
        tc = new Float32Array([
            1.0, 0.0,
            0.0, 0.0,
            1.0, 1.0,
            0.0, 1.0
        ]);
    else
        tc = new Float32Array([
            1.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            0.0, 0.0
        ]);

    if (flipX.get())
    {
        tc[0] = 0.0;
        tc[2] = 1.0;
        tc[4] = 0.0;
        tc[6] = 1.0;
    }

    geom.setTexCoords(tc);

    geom.verticesIndices = new Uint16Array([
        2, 1, 0,
        3, 1, 2
    ]);

    geom.vertexNormals = new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
    ]);
    geom.tangents = new Float32Array([
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0,
        -1, 0, 0]);
    geom.biTangents == new Float32Array([
        0, -1, 0,
        0, -1, 0,
        0, -1, 0,
        0, -1, 0]);

    if (!mesh) mesh = new CGL.Mesh(cgl, geom);
    else mesh.setGeom(geom);
}


};

Ops.Gl.Meshes.FullscreenRectangle.prototype = new CABLES.Op();
CABLES.OPS["255bd15b-cc91-4a12-9b4e-53c710cbb282"]={f:Ops.Gl.Meshes.FullscreenRectangle,objName:"Ops.Gl.Meshes.FullscreenRectangle"};




// **************************************************************
// 
// Ops.Array.ArrayUnpack3
// 
// **************************************************************

Ops.Array.ArrayUnpack3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const inArray1 = op.inArray("Array in xyz"),
    outArray1 = op.outArray("Array 1 out"),
    outArray2 = op.outArray("Array 2 out"),
    outArray3 = op.outArray("Array 3 out"),
    outArrayLength = op.outNumber("Array lengths");

let showingError = false;

const arr1 = [];
const arr2 = [];
const arr3 = [];

inArray1.onChange = update;

function update()
{
    let array1 = inArray1.get();

    if (!array1)
    {
        outArray1.set(null);
        return;
    }

    if (array1.length % 3 !== 0)
    {
        if (!showingError)
        {
            op.uiAttr({ "error": "Arrays length not divisible by 3 !" });
            outArrayLength.set(0);
            showingError = true;
        }
        return;
    }

    if (showingError)
    {
        showingError = false;
        op.uiAttr({ "error": null });
    }

    arr1.length = Math.floor(array1.length / 3);
    arr2.length = Math.floor(array1.length / 3);
    arr3.length = Math.floor(array1.length / 3);

    for (let i = 0; i < array1.length / 3; i++)
    {
        arr1[i] = array1[i * 3];
        arr2[i] = array1[i * 3 + 1];
        arr3[i] = array1[i * 3 + 2];
    }

    outArray1.set(null);
    outArray2.set(null);
    outArray3.set(null);
    outArray1.set(arr1);
    outArray2.set(arr2);
    outArray3.set(arr3);
    outArrayLength.set(arr1.length);
}


};

Ops.Array.ArrayUnpack3.prototype = new CABLES.Op();
CABLES.OPS["fa671f66-6957-41e6-ac35-d615b7c29285"]={f:Ops.Array.ArrayUnpack3,objName:"Ops.Array.ArrayUnpack3"};




// **************************************************************
// 
// Ops.Array.ArrayPack3
// 
// **************************************************************

Ops.Array.ArrayPack3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const exe = op.inTrigger("Trigger in"),
    inArr1 = op.inArray("Array 1"),
    inArr2 = op.inArray("Array 2"),
    inArr3 = op.inArray("Array 3"),
    exeOut = op.outTrigger("Trigger out"),
    outArr = op.outArray("Array out", 3),
    outNum = op.outNumber("Num Points"),
    outArrayLength = op.outNumber("Array length");

let showingError = false;

let arr = [];
let emptyArray = [];
let needsCalc = true;

exe.onTriggered = update;

inArr1.onChange = inArr2.onChange = inArr3.onChange = calcLater;

function calcLater()
{
    needsCalc = true;
}

function update()
{
    let array1 = inArr1.get();
    let array2 = inArr2.get();
    let array3 = inArr3.get();

    if (!array1 && !array2 && !array3)
    {
        outArr.set(null);
        outNum.set(0);
        return;
    }
    // only update if array has changed
    if (needsCalc)
    {
        let arrlen = 0;

        if (!array1 || !array2 || !array3)
        {
            if (array1) arrlen = array1.length;
            else if (array2) arrlen = array2.length;
            else if (array3) arrlen = array3.length;

            if (emptyArray.length != arrlen)
                for (var i = 0; i < arrlen; i++) emptyArray[i] = 0;

            if (!array1)array1 = emptyArray;
            if (!array2)array2 = emptyArray;
            if (!array3)array3 = emptyArray;
        }

        if ((array1.length !== array2.length) || (array2.length !== array3.length))
        {
            op.setUiError("arraylen", "Arrays do not have the same length !");
            return;
        }
        op.setUiError("arraylen", null);

        arr.length = array1.length;
        for (var i = 0; i < array1.length; i++)
        {
            arr[i * 3 + 0] = array1[i];
            arr[i * 3 + 1] = array2[i];
            arr[i * 3 + 2] = array3[i];
        }

        needsCalc = false;
        outArr.set(null);
        outArr.set(arr);
        outNum.set(arr.length / 3);
        outArrayLength.set(arr.length);
    }

    exeOut.trigger();
}


};

Ops.Array.ArrayPack3.prototype = new CABLES.Op();
CABLES.OPS["2bcf32fe-3cbd-48fd-825a-61255bebda9b"]={f:Ops.Array.ArrayPack3,objName:"Ops.Array.ArrayPack3"};




// **************************************************************
// 
// Ops.Anim.SineAnim
// 
// **************************************************************

Ops.Anim.SineAnim = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    exe = op.inTrigger("exe"),
    mode = op.inSwitch("Mode", ["Sine", "Cosine"], "Sine"),
    phase = op.inValueFloat("phase", 0),
    mul = op.inValueFloat("frequency", 1),
    amplitude = op.inValueFloat("amplitude", 1),
    trigOut = op.outTrigger("Trigger out"),
    result = op.outNumber("result");

let selectIndex = 0;
const SINE = 0;
const COSINE = 1;

op.toWorkPortsNeedToBeLinked(exe);

exe.onTriggered = exec;
mode.onChange = onModeChange;

exec();
onModeChange();

function onModeChange()
{
    let modeSelectValue = mode.get();

    if (modeSelectValue === "Sine") selectIndex = SINE;
    else if (modeSelectValue === "Cosine") selectIndex = COSINE;

    exec();
}

function exec()
{
    if (selectIndex == SINE) result.set(amplitude.get() * Math.sin((op.patch.freeTimer.get() * mul.get()) + phase.get()));
    else result.set(amplitude.get() * Math.cos((op.patch.freeTimer.get() * mul.get()) + phase.get()));
    trigOut.trigger();
}


};

Ops.Anim.SineAnim.prototype = new CABLES.Op();
CABLES.OPS["736d3d0e-c920-449e-ade0-f5ca6018fb5c"]={f:Ops.Anim.SineAnim,objName:"Ops.Anim.SineAnim"};




// **************************************************************
// 
// Ops.Array.TransformArray3
// 
// **************************************************************

Ops.Array.TransformArray3 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    inExec = op.inTriggerButton("Transform"),
    inArr = op.inArray("Array", 3),
    transX = op.inFloat("Translate X"),
    transY = op.inFloat("Translate Y"),
    transZ = op.inFloat("Translate Z"),
    scaleX = op.inFloat("Scale X", 1),
    scaleY = op.inFloat("Scale Y", 1),
    scaleZ = op.inFloat("Scale Z", 1),
    rotX = op.inFloat("Rotation X"),
    rotY = op.inFloat("Rotation Y"),
    rotZ = op.inFloat("Rotation Z"),
    next = op.outTrigger("Next"),
    outArr = op.outArray("Result", 3);

op.setPortGroup("Translation", [transX, transY, transZ]);
op.setPortGroup("Scale", [scaleX, scaleY, scaleZ]);
op.setPortGroup("Rotation", [rotX, rotY, rotZ]);

let resultArr = [];
let needsCalc = true;

let rotVec = vec3.create();
let emptyVec = vec3.create();
let transVec = vec3.create();
let centerVec = vec3.create();

inExec.onTriggered = doTransform;

inArr.onChange =
transX.onChange = transY.onChange = transZ.onChange =
scaleX.onChange = scaleY.onChange = scaleZ.onChange =
rotX.onChange = rotY.onChange = rotZ.onChange = calcLater;

function calcLater()
{
    needsCalc = true;
}

function doTransform()
{
    let arr = inArr.get();
    if (!arr)
    {
        outArr.set(null);
        return;
    }
    if (needsCalc)
    {
        resultArr.length = arr.length;

        const nrotx = rotX.get();
        const nroty = rotY.get();
        const nrotz = rotZ.get();
        const scx = scaleX.get();
        const scy = scaleY.get();
        const scz = scaleZ.get();
        const transx = transX.get();
        const transy = transY.get();
        const transz = transZ.get();
        const doRot = nrotx || nroty || nrotz;

        for (let i = 0; i < arr.length; i += 3)
        {
            resultArr[i + 0] = arr[i + 0] * scx;
            resultArr[i + 1] = arr[i + 1] * scy;
            resultArr[i + 2] = arr[i + 2] * scz;

            resultArr[i + 0] = resultArr[i + 0] + transx;
            resultArr[i + 1] = resultArr[i + 1] + transy;
            resultArr[i + 2] = resultArr[i + 2] + transz;

            if (doRot)
            {
                vec3.set(rotVec,
                    resultArr[i + 0],
                    resultArr[i + 1],
                    resultArr[i + 2]);

                if (nrotx != 0) vec3.rotateX(rotVec, rotVec, transVec, nrotx * CGL.DEG2RAD);
                if (nroty != 0) vec3.rotateY(rotVec, rotVec, transVec, nroty * CGL.DEG2RAD);
                if (nrotz != 0) vec3.rotateZ(rotVec, rotVec, transVec, nrotz * CGL.DEG2RAD);

                resultArr[i + 0] = rotVec[0];
                resultArr[i + 1] = rotVec[1];
                resultArr[i + 2] = rotVec[2];
            }
        }

        needsCalc = false;
        outArr.set(null);
        outArr.set(resultArr);
    }
    next.trigger();
}


};

Ops.Array.TransformArray3.prototype = new CABLES.Op();
CABLES.OPS["b18040d6-13d7-4f55-950f-3f95cafa4e90"]={f:Ops.Array.TransformArray3,objName:"Ops.Array.TransformArray3"};




// **************************************************************
// 
// Ops.Sidebar.Sidebar
// 
// **************************************************************

Ops.Sidebar.Sidebar = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={"style_css":" /*\n * SIDEBAR\n  http://danielstern.ca/range.css/#/\n  https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-progress-value\n */\n\n.sidebar-icon-undo\n{\n    width:10px;\n    height:10px;\n    background-image: url(\"data:image/svg+xml;charset=utf8, %3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' fill='none' stroke='grey' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7v6h6'/%3E%3Cpath d='M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13'/%3E%3C/svg%3E\");\n    background-size: 19px;\n    background-repeat: no-repeat;\n    top: -19px;\n    margin-top: -7px;\n}\n\n.icon-chevron-down {\n    top: 2px;\n    right: 9px;\n}\n\n.iconsidebar-chevron-up,.sidebar__close-button {\n\tbackground-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4ODg4ODgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0iZmVhdGhlciBmZWF0aGVyLWNoZXZyb24tdXAiPjxwb2x5bGluZSBwb2ludHM9IjE4IDE1IDEyIDkgNiAxNSI+PC9wb2x5bGluZT48L3N2Zz4=);\n}\n\n.iconsidebar-minimizebutton {\n    background-position: 98% center;\n    background-repeat: no-repeat;\n}\n\n.sidebar-cables-right\n{\n    right: 15px;\n    left: initial !important;\n}\n\n.sidebar-cables {\n    --sidebar-color: #07f78c;\n    --sidebar-width: 220px;\n    --sidebar-border-radius: 10px;\n    --sidebar-monospace-font-stack: \"SFMono-Regular\", Consolas, \"Liberation Mono\", Menlo, Courier, monospace;\n    --sidebar-hover-transition-time: .2s;\n\n    position: absolute;\n    top: 15px;\n    left: 15px;\n    border-radius: var(--sidebar-border-radius);\n    z-index: 100000;\n    color: #BBBBBB;\n    width: var(  --sidebar-width);\n    max-height: 100%;\n    box-sizing: border-box;\n    overflow-y: auto;\n    overflow-x: hidden;\n    font-size: 13px;\n    font-family: Arial;\n    line-height: 1em; /* prevent emojis from breaking height of the title */\n}\n\n.sidebar-cables::selection {\n    background-color: var(--sidebar-color);\n    color: #EEEEEE;\n}\n\n.sidebar-cables::-webkit-scrollbar {\n    background-color: transparent;\n    --cables-scrollbar-width: 8px;\n    width: var(--cables-scrollbar-width);\n}\n\n.sidebar-cables::-webkit-scrollbar-track {\n    background-color: transparent;\n    width: var(--cables-scrollbar-width);\n}\n\n.sidebar-cables::-webkit-scrollbar-thumb {\n    background-color: #333333;\n    border-radius: 4px;\n    width: var(--cables-scrollbar-width);\n}\n\n.sidebar-cables--closed {\n    width: auto;\n}\n\n.sidebar__close-button {\n    background-color: #222;\n    /*-webkit-user-select: none;  */\n    /*-moz-user-select: none;     */\n    /*-ms-user-select: none;      */\n    /*user-select: none;          */\n    /*transition: background-color var(--sidebar-hover-transition-time);*/\n    /*color: #CCCCCC;*/\n    height: 2px;\n    /*border-bottom:20px solid #222;*/\n\n    /*box-sizing: border-box;*/\n    /*padding-top: 2px;*/\n    /*text-align: center;*/\n    /*cursor: pointer;*/\n    /*border-radius: 0 0 var(--sidebar-border-radius) var(--sidebar-border-radius);*/\n    /*opacity: 1.0;*/\n    /*transition: opacity 0.3s;*/\n    /*overflow: hidden;*/\n}\n\n.sidebar__close-button-icon {\n    display: inline-block;\n    /*opacity: 0;*/\n    width: 20px;\n    height: 20px;\n    /*position: relative;*/\n    /*top: -1px;*/\n\n\n}\n\n.sidebar--closed {\n    width: auto;\n    margin-right: 20px;\n}\n\n.sidebar--closed .sidebar__close-button {\n    margin-top: 8px;\n    margin-left: 8px;\n    padding:10px;\n\n    height: 25px;\n    width:25px;\n    border-radius: 50%;\n    cursor: pointer;\n    opacity: 0.3;\n    background-repeat: no-repeat;\n    background-position: center center;\n    transform:rotate(180deg);\n}\n\n.sidebar--closed .sidebar__group\n{\n    display:none;\n\n}\n.sidebar--closed .sidebar__close-button-icon {\n    background-position: 0px 0px;\n}\n\n.sidebar__close-button:hover {\n    background-color: #111111;\n    opacity: 1.0 !important;\n}\n\n/*\n * SIDEBAR ITEMS\n */\n\n.sidebar__items {\n    /* max-height: 1000px; */\n    /* transition: max-height 0.5;*/\n    background-color: #222;\n    padding-bottom: 20px;\n}\n\n.sidebar--closed .sidebar__items {\n    /* max-height: 0; */\n    height: 0;\n    display: none;\n    pointer-interactions: none;\n}\n\n.sidebar__item__right {\n    float: right;\n}\n\n/*\n * SIDEBAR GROUP\n */\n\n.sidebar__group {\n    /*background-color: #1A1A1A;*/\n    overflow: hidden;\n    box-sizing: border-box;\n    animate: height;\n    /*background-color: #151515;*/\n    /* max-height: 1000px; */\n    /* transition: max-height 0.5s; */\n--sidebar-group-header-height: 33px;\n}\n\n.sidebar__group-items\n{\n    padding-top: 15px;\n    padding-bottom: 15px;\n}\n\n.sidebar__group--closed {\n    /* max-height: 13px; */\n    height: var(--sidebar-group-header-height);\n}\n\n.sidebar__group-header {\n    box-sizing: border-box;\n    color: #EEEEEE;\n    background-color: #151515;\n    -webkit-user-select: none;  /* Chrome all / Safari all */\n    -moz-user-select: none;     /* Firefox all */\n    -ms-user-select: none;      /* IE 10+ */\n    user-select: none;          /* Likely future */\n\n    /*height: 100%;//var(--sidebar-group-header-height);*/\n\n    padding-top: 7px;\n    text-transform: uppercase;\n    letter-spacing: 0.08em;\n    cursor: pointer;\n    /*transition: background-color var(--sidebar-hover-transition-time);*/\n    position: relative;\n}\n\n.sidebar__group-header:hover {\n  background-color: #111111;\n}\n\n.sidebar__group-header-title {\n  /*float: left;*/\n  overflow: hidden;\n  padding: 0 15px;\n  padding-top:5px;\n  padding-bottom:10px;\n  font-weight:bold;\n}\n\n.sidebar__group-header-undo {\n    float: right;\n    overflow: hidden;\n    padding-right: 15px;\n    padding-top:5px;\n    font-weight:bold;\n  }\n\n.sidebar__group-header-icon {\n    width: 17px;\n    height: 14px;\n    background-repeat: no-repeat;\n    display: inline-block;\n    position: absolute;\n    background-size: cover;\n\n    /* icon open */\n    /* feather icon: chevron up */\n    background-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4ODg4ODgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0iZmVhdGhlciBmZWF0aGVyLWNoZXZyb24tdXAiPjxwb2x5bGluZSBwb2ludHM9IjE4IDE1IDEyIDkgNiAxNSI+PC9wb2x5bGluZT48L3N2Zz4=);\n    top: 4px;\n    right: 5px;\n    opacity: 0.0;\n    transition: opacity 0.3;\n}\n\n.sidebar__group-header:hover .sidebar__group-header-icon {\n    opacity: 1.0;\n}\n\n/* icon closed */\n.sidebar__group--closed .sidebar__group-header-icon {\n    /* feather icon: chevron down */\n    background-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4ODg4ODgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0iZmVhdGhlciBmZWF0aGVyLWNoZXZyb24tZG93biI+PHBvbHlsaW5lIHBvaW50cz0iNiA5IDEyIDE1IDE4IDkiPjwvcG9seWxpbmU+PC9zdmc+);\n    top: 4px;\n    right: 5px;\n}\n\n/*\n * SIDEBAR ITEM\n */\n\n.sidebar__item\n{\n    box-sizing: border-box;\n    padding: 7px;\n    padding-left:15px;\n    padding-right:15px;\n\n    overflow: hidden;\n    position: relative;\n}\n\n.sidebar__item-label {\n    display: inline-block;\n    -webkit-user-select: none;  /* Chrome all / Safari all */\n    -moz-user-select: none;     /* Firefox all */\n    -ms-user-select: none;      /* IE 10+ */\n    user-select: none;          /* Likely future */\n    width: calc(50% - 7px);\n    margin-right: 7px;\n    margin-top: 2px;\n    text-overflow: ellipsis;\n    /* overflow: hidden; */\n}\n\n.sidebar__item-value-label {\n    font-family: var(--sidebar-monospace-font-stack);\n    display: inline-block;\n    text-overflow: ellipsis;\n    overflow: hidden;\n    white-space: nowrap;\n    max-width: 60%;\n}\n\n.sidebar__item-value-label::selection {\n    background-color: var(--sidebar-color);\n    color: #EEEEEE;\n}\n\n.sidebar__item + .sidebar__item,\n.sidebar__item + .sidebar__group,\n.sidebar__group + .sidebar__item,\n.sidebar__group + .sidebar__group {\n    /*border-top: 1px solid #272727;*/\n}\n\n/*\n * SIDEBAR ITEM TOGGLE\n */\n\n/*.sidebar__toggle */\n.icon_toggle{\n    cursor: pointer;\n}\n\n.sidebar__toggle-input {\n    --sidebar-toggle-input-color: #CCCCCC;\n    --sidebar-toggle-input-color-hover: #EEEEEE;\n    --sidebar-toggle-input-border-size: 2px;\n    display: inline;\n    float: right;\n    box-sizing: border-box;\n    border-radius: 50%;\n    cursor: pointer;\n    --toggle-size: 11px;\n    margin-top: 2px;\n    background-color: transparent !important;\n    border: var(--sidebar-toggle-input-border-size) solid var(--sidebar-toggle-input-color);\n    width: var(--toggle-size);\n    height: var(--toggle-size);\n    transition: background-color var(--sidebar-hover-transition-time);\n    transition: border-color var(--sidebar-hover-transition-time);\n}\n.sidebar__toggle:hover .sidebar__toggle-input {\n    border-color: var(--sidebar-toggle-input-color-hover);\n}\n\n.sidebar__toggle .sidebar__item-value-label {\n    -webkit-user-select: none;  /* Chrome all / Safari all */\n    -moz-user-select: none;     /* Firefox all */\n    -ms-user-select: none;      /* IE 10+ */\n    user-select: none;          /* Likely future */\n    max-width: calc(50% - 12px);\n}\n.sidebar__toggle-input::after { clear: both; }\n\n.sidebar__toggle--active .icon_toggle\n{\n\n    background-image: url(data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9IjE1cHgiIHdpZHRoPSIzMHB4IiBmaWxsPSIjMDZmNzhiIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMTAwIDEwMCIgZW5hYmxlLWJhY2tncm91bmQ9Im5ldyAwIDAgMTAwIDEwMCIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+PGcgZGlzcGxheT0ibm9uZSI+PGcgZGlzcGxheT0iaW5saW5lIj48Zz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iIzA2Zjc4YiIgZD0iTTMwLDI3QzE3LjM1LDI3LDcsMzcuMzUsNyw1MGwwLDBjMCwxMi42NSwxMC4zNSwyMywyMywyM2g0MCBjMTIuNjUsMCwyMy0xMC4zNSwyMy0yM2wwLDBjMC0xMi42NS0xMC4zNS0yMy0yMy0yM0gzMHogTTcwLDY3Yy05LjM4OSwwLTE3LTcuNjEtMTctMTdzNy42MTEtMTcsMTctMTdzMTcsNy42MSwxNywxNyAgICAgUzc5LjM4OSw2Nyw3MCw2N3oiPjwvcGF0aD48L2c+PC9nPjwvZz48Zz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTMwLDI3QzE3LjM1LDI3LDcsMzcuMzUsNyw1MGwwLDBjMCwxMi42NSwxMC4zNSwyMywyMywyM2g0MCAgIGMxMi42NSwwLDIzLTEwLjM1LDIzLTIzbDAsMGMwLTEyLjY1LTEwLjM1LTIzLTIzLTIzSDMweiBNNzAsNjdjLTkuMzg5LDAtMTctNy42MS0xNy0xN3M3LjYxMS0xNywxNy0xN3MxNyw3LjYxLDE3LDE3ICAgUzc5LjM4OSw2Nyw3MCw2N3oiPjwvcGF0aD48L2c+PGcgZGlzcGxheT0ibm9uZSI+PGcgZGlzcGxheT0iaW5saW5lIj48cGF0aCBmaWxsPSIjMDZmNzhiIiBzdHJva2U9IiMwNmY3OGIiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBkPSJNNyw1MGMwLDEyLjY1LDEwLjM1LDIzLDIzLDIzaDQwICAgIGMxMi42NSwwLDIzLTEwLjM1LDIzLTIzbDAsMGMwLTEyLjY1LTEwLjM1LTIzLTIzLTIzSDMwQzE3LjM1LDI3LDcsMzcuMzUsNyw1MEw3LDUweiI+PC9wYXRoPjwvZz48Y2lyY2xlIGRpc3BsYXk9ImlubGluZSIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiMwNmY3OGIiIHN0cm9rZT0iIzA2Zjc4YiIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIGN4PSI3MCIgY3k9IjUwIiByPSIxNyI+PC9jaXJjbGU+PC9nPjxnIGRpc3BsYXk9Im5vbmUiPjxwYXRoIGRpc3BsYXk9ImlubGluZSIgZD0iTTcwLDI1SDMwQzE2LjIxNSwyNSw1LDM2LjIxNSw1LDUwczExLjIxNSwyNSwyNSwyNWg0MGMxMy43ODUsMCwyNS0xMS4yMTUsMjUtMjVTODMuNzg1LDI1LDcwLDI1eiBNNzAsNzEgICBIMzBDMTguNDIxLDcxLDksNjEuNTc5LDksNTBzOS40MjEtMjEsMjEtMjFoNDBjMTEuNTc5LDAsMjEsOS40MjEsMjEsMjFTODEuNTc5LDcxLDcwLDcxeiBNNzAsMzFjLTEwLjQ3NywwLTE5LDguNTIzLTE5LDE5ICAgczguNTIzLDE5LDE5LDE5czE5LTguNTIzLDE5LTE5UzgwLjQ3NywzMSw3MCwzMXogTTcwLDY1Yy04LjI3MSwwLTE1LTYuNzI5LTE1LTE1czYuNzI5LTE1LDE1LTE1czE1LDYuNzI5LDE1LDE1Uzc4LjI3MSw2NSw3MCw2NXoiPjwvcGF0aD48L2c+PC9zdmc+);\n    opacity: 1;\n    transform: rotate(0deg);\n}\n\n\n.icon_toggle\n{\n    float: right;\n    width:40px;\n    height:18px;\n    background-image: url(data:image/svg+xml;base64,PHN2ZyBoZWlnaHQ9IjE1cHgiIHdpZHRoPSIzMHB4IiBmaWxsPSIjYWFhYWFhIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIHg9IjBweCIgeT0iMHB4IiB2aWV3Qm94PSIwIDAgMTAwIDEwMCIgZW5hYmxlLWJhY2tncm91bmQ9Im5ldyAwIDAgMTAwIDEwMCIgeG1sOnNwYWNlPSJwcmVzZXJ2ZSI+PGcgZGlzcGxheT0ibm9uZSI+PGcgZGlzcGxheT0iaW5saW5lIj48Zz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZmlsbD0iI2FhYWFhYSIgZD0iTTMwLDI3QzE3LjM1LDI3LDcsMzcuMzUsNyw1MGwwLDBjMCwxMi42NSwxMC4zNSwyMywyMywyM2g0MCBjMTIuNjUsMCwyMy0xMC4zNSwyMy0yM2wwLDBjMC0xMi42NS0xMC4zNS0yMy0yMy0yM0gzMHogTTcwLDY3Yy05LjM4OSwwLTE3LTcuNjEtMTctMTdzNy42MTEtMTcsMTctMTdzMTcsNy42MSwxNywxNyAgICAgUzc5LjM4OSw2Nyw3MCw2N3oiPjwvcGF0aD48L2c+PC9nPjwvZz48Zz48cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTMwLDI3QzE3LjM1LDI3LDcsMzcuMzUsNyw1MGwwLDBjMCwxMi42NSwxMC4zNSwyMywyMywyM2g0MCAgIGMxMi42NSwwLDIzLTEwLjM1LDIzLTIzbDAsMGMwLTEyLjY1LTEwLjM1LTIzLTIzLTIzSDMweiBNNzAsNjdjLTkuMzg5LDAtMTctNy42MS0xNy0xN3M3LjYxMS0xNywxNy0xN3MxNyw3LjYxLDE3LDE3ICAgUzc5LjM4OSw2Nyw3MCw2N3oiPjwvcGF0aD48L2c+PGcgZGlzcGxheT0ibm9uZSI+PGcgZGlzcGxheT0iaW5saW5lIj48cGF0aCBmaWxsPSIjYWFhYWFhIiBzdHJva2U9IiNhYWFhYWEiIHN0cm9rZS13aWR0aD0iNCIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIiBkPSJNNyw1MGMwLDEyLjY1LDEwLjM1LDIzLDIzLDIzaDQwICAgIGMxMi42NSwwLDIzLTEwLjM1LDIzLTIzbDAsMGMwLTEyLjY1LTEwLjM1LTIzLTIzLTIzSDMwQzE3LjM1LDI3LDcsMzcuMzUsNyw1MEw3LDUweiI+PC9wYXRoPjwvZz48Y2lyY2xlIGRpc3BsYXk9ImlubGluZSIgZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGZpbGw9IiNhYWFhYWEiIHN0cm9rZT0iI2FhYWFhYSIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbWl0ZXJsaW1pdD0iMTAiIGN4PSI3MCIgY3k9IjUwIiByPSIxNyI+PC9jaXJjbGU+PC9nPjxnIGRpc3BsYXk9Im5vbmUiPjxwYXRoIGRpc3BsYXk9ImlubGluZSIgZD0iTTcwLDI1SDMwQzE2LjIxNSwyNSw1LDM2LjIxNSw1LDUwczExLjIxNSwyNSwyNSwyNWg0MGMxMy43ODUsMCwyNS0xMS4yMTUsMjUtMjVTODMuNzg1LDI1LDcwLDI1eiBNNzAsNzEgICBIMzBDMTguNDIxLDcxLDksNjEuNTc5LDksNTBzOS40MjEtMjEsMjEtMjFoNDBjMTEuNTc5LDAsMjEsOS40MjEsMjEsMjFTODEuNTc5LDcxLDcwLDcxeiBNNzAsMzFjLTEwLjQ3NywwLTE5LDguNTIzLTE5LDE5ICAgczguNTIzLDE5LDE5LDE5czE5LTguNTIzLDE5LTE5UzgwLjQ3NywzMSw3MCwzMXogTTcwLDY1Yy04LjI3MSwwLTE1LTYuNzI5LTE1LTE1czYuNzI5LTE1LDE1LTE1czE1LDYuNzI5LDE1LDE1Uzc4LjI3MSw2NSw3MCw2NXoiPjwvcGF0aD48L2c+PC9zdmc+);\n    background-size: 50px 37px;\n    background-position: -6px -10px;\n    transform: rotate(180deg);\n    opacity: 0.4;\n}\n\n\n\n/*.sidebar__toggle--active .sidebar__toggle-input {*/\n/*    transition: background-color var(--sidebar-hover-transition-time);*/\n/*    background-color: var(--sidebar-toggle-input-color);*/\n/*}*/\n/*.sidebar__toggle--active .sidebar__toggle-input:hover*/\n/*{*/\n/*    background-color: var(--sidebar-toggle-input-color-hover);*/\n/*    border-color: var(--sidebar-toggle-input-color-hover);*/\n/*    transition: background-color var(--sidebar-hover-transition-time);*/\n/*    transition: border-color var(--sidebar-hover-transition-time);*/\n/*}*/\n\n/*\n * SIDEBAR ITEM BUTTON\n */\n\n.sidebar__button {}\n\n.sidebar__button-input {\n    -webkit-user-select: none;  /* Chrome all / Safari all */\n    -moz-user-select: none;     /* Firefox all */\n    -ms-user-select: none;      /* IE 10+ */\n    user-select: none;          /* Likely future */\n    min-height: 24px;\n    background-color: transparent;\n    color: #CCCCCC;\n    box-sizing: border-box;\n    padding-top: 3px;\n    text-align: center;\n    border-radius: 125px;\n    border:2px solid #555;\n    cursor: pointer;\n    padding-bottom: 3px;\n}\n\n.sidebar__button-input.plus, .sidebar__button-input.minus {\n    display: inline-block;\n    min-width: 20px;\n}\n\n.sidebar__button-input:hover {\n  background-color: #333;\n  border:2px solid var(--sidebar-color);\n}\n\n/*\n * VALUE DISPLAY (shows a value)\n */\n\n.sidebar__value-display {}\n\n/*\n * SLIDER\n */\n\n.sidebar__slider {\n    --sidebar-slider-input-height: 3px;\n}\n\n.sidebar__slider-input-wrapper {\n    width: 100%;\n\n    margin-top: 8px;\n    position: relative;\n}\n\n.sidebar__slider-input {\n    -webkit-appearance: none;\n    appearance: none;\n    margin: 0;\n    width: 100%;\n    height: var(--sidebar-slider-input-height);\n    background: #555;\n    cursor: pointer;\n    outline: 0;\n\n    -webkit-transition: .2s;\n    transition: background-color .2s;\n    border: none;\n}\n\n.sidebar__slider-input:focus, .sidebar__slider-input:hover {\n    border: none;\n}\n\n.sidebar__slider-input-active-track {\n    user-select: none;\n    position: absolute;\n    z-index: 11;\n    top: 0;\n    left: 0;\n    background-color: var(--sidebar-color);\n    pointer-events: none;\n    height: var(--sidebar-slider-input-height);\n    max-width: 100%;\n}\n\n/* Mouse-over effects */\n.sidebar__slider-input:hover {\n    /*background-color: #444444;*/\n}\n\n/*.sidebar__slider-input::-webkit-progress-value {*/\n/*    background-color: green;*/\n/*    color:green;*/\n\n/*    }*/\n\n/* The slider handle (use -webkit- (Chrome, Opera, Safari, Edge) and -moz- (Firefox) to override default look) */\n\n.sidebar__slider-input::-moz-range-thumb\n{\n    position: absolute;\n    height: 15px;\n    width: 15px;\n    z-index: 900 !important;\n    border-radius: 20px !important;\n    cursor: pointer;\n    background: var(--sidebar-color) !important;\n    user-select: none;\n\n}\n\n.sidebar__slider-input::-webkit-slider-thumb\n{\n    position: relative;\n    appearance: none;\n    -webkit-appearance: none;\n    user-select: none;\n    height: 15px;\n    width: 15px;\n    display: block;\n    z-index: 900 !important;\n    border: 0;\n    border-radius: 20px !important;\n    cursor: pointer;\n    background: #777 !important;\n}\n\n.sidebar__slider-input:hover ::-webkit-slider-thumb {\n    background-color: #EEEEEE !important;\n}\n\n/*.sidebar__slider-input::-moz-range-thumb {*/\n\n/*    width: 0 !important;*/\n/*    height: var(--sidebar-slider-input-height);*/\n/*    background: #EEEEEE;*/\n/*    cursor: pointer;*/\n/*    border-radius: 0 !important;*/\n/*    border: none;*/\n/*    outline: 0;*/\n/*    z-index: 100 !important;*/\n/*}*/\n\n.sidebar__slider-input::-moz-range-track {\n    background-color: transparent;\n    z-index: 11;\n}\n\n/*.sidebar__slider-input::-moz-range-thumb:hover {*/\n  /* background-color: #EEEEEE; */\n/*}*/\n\n\n/*.sidebar__slider-input-wrapper:hover .sidebar__slider-input-active-track {*/\n/*    background-color: #EEEEEE;*/\n/*}*/\n\n/*.sidebar__slider-input-wrapper:hover .sidebar__slider-input::-moz-range-thumb {*/\n/*    background-color: #fff !important;*/\n/*}*/\n\n/*.sidebar__slider-input-wrapper:hover .sidebar__slider-input::-webkit-slider-thumb {*/\n/*    background-color: #EEEEEE;*/\n/*}*/\n\n.sidebar__slider input[type=text],\n.sidebar__slider input[type=paddword]\n{\n    box-sizing: border-box;\n    /*background-color: #333333;*/\n    text-align: right;\n    color: #BBBBBB;\n    display: inline-block;\n    background-color: transparent !important;\n\n    width: 40%;\n    height: 18px;\n    outline: none;\n    border: none;\n    border-radius: 0;\n    padding: 0 0 0 4px !important;\n    margin: 0;\n}\n\n.sidebar__slider input[type=text]:active,\n.sidebar__slider input[type=text]:focus,\n.sidebar__slider input[type=text]:hover\n.sidebar__slider input[type=password]:active,\n.sidebar__slider input[type=password]:focus,\n.sidebar__slider input[type=password]:hover\n{\n\n    color: #EEEEEE;\n}\n\n/*\n * TEXT / DESCRIPTION\n */\n\n.sidebar__text .sidebar__item-label {\n    width: auto;\n    display: block;\n    max-height: none;\n    margin-right: 0;\n    line-height: 1.1em;\n}\n\n/*\n * SIDEBAR INPUT\n */\n.sidebar__text-input textarea,\n.sidebar__text-input input[type=text],\n.sidebar__text-input input[type=password] {\n    box-sizing: border-box;\n    background-color: #333333;\n    color: #BBBBBB;\n    display: inline-block;\n    width: 50%;\n    height: 18px;\n    outline: none;\n    border: none;\n    border-radius: 0;\n    border:1px solid #666;\n    padding: 0 0 0 4px !important;\n    margin: 0;\n}\n\n.sidebar__text-input textarea:focus::placeholder {\n  color: transparent;\n}\n\n.sidebar__color-picker .sidebar__item-label\n{\n    width:45%;\n}\n\n.sidebar__text-input textarea,\n.sidebar__text-input input[type=text]:active,\n.sidebar__text-input input[type=text]:focus,\n.sidebar__text-input input[type=text]:hover,\n.sidebar__text-input input[type=password]:active,\n.sidebar__text-input input[type=password]:focus,\n.sidebar__text-input input[type=password]:hover {\n    background-color: transparent;\n    color: #EEEEEE;\n}\n\n.sidebar__text-input textarea\n{\n    margin-top:10px;\n    height:60px;\n    width:100%;\n}\n\n/*\n * SIDEBAR SELECT\n */\n\n\n\n .sidebar__select {}\n .sidebar__select-select {\n    color: #BBBBBB;\n    /*-webkit-appearance: none;*/\n    /*-moz-appearance: none;*/\n    appearance: none;\n    /*box-sizing: border-box;*/\n    width: 50%;\n    /*height: 20px;*/\n    background-color: #333333;\n    /*background-image: url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM4ODg4ODgiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBjbGFzcz0iZmVhdGhlciBmZWF0aGVyLWNoZXZyb24tZG93biI+PHBvbHlsaW5lIHBvaW50cz0iNiA5IDEyIDE1IDE4IDkiPjwvcG9seWxpbmU+PC9zdmc+);*/\n    background-repeat: no-repeat;\n    background-position: right center;\n    background-size: 16px 16px;\n    margin: 0;\n    /*padding: 0 2 2 6px;*/\n    border-radius: 5px;\n    border: 1px solid #777;\n    background-color: #444;\n    cursor: pointer;\n    outline: none;\n    padding-left: 5px;\n\n }\n\n.sidebar__select-select:hover,\n.sidebar__select-select:active,\n.sidebar__select-select:active {\n    background-color: #444444;\n    color: #EEEEEE;\n}\n\n/*\n * COLOR PICKER\n */\n\n\n .sidebar__color-picker input[type=text] {\n    box-sizing: border-box;\n    background-color: #333333;\n    color: #BBBBBB;\n    display: inline-block;\n    width: calc(50% - 21px); /* 50% minus space of picker circle */\n    height: 18px;\n    outline: none;\n    border: none;\n    border-radius: 0;\n    padding: 0 0 0 4px !important;\n    margin: 0;\n    margin-right: 7px;\n}\n\n.sidebar__color-picker input[type=text]:active,\n.sidebar__color-picker input[type=text]:focus,\n.sidebar__color-picker input[type=text]:hover {\n    background-color: #444444;\n    color: #EEEEEE;\n}\n\ndiv.sidebar__color-picker-color-input,\n.sidebar__color-picker input[type=color],\n.sidebar__palette-picker input[type=color] {\n    display: inline-block;\n    border-radius: 100%;\n    height: 14px;\n    width: 14px;\n\n    padding: 0;\n    border: none;\n    /*border:2px solid red;*/\n    border-color: transparent;\n    outline: none;\n    background: none;\n    appearance: none;\n    -moz-appearance: none;\n    -webkit-appearance: none;\n    cursor: pointer;\n    position: relative;\n    top: 3px;\n}\n.sidebar__color-picker input[type=color]:focus,\n.sidebar__palette-picker input[type=color]:focus {\n    outline: none;\n}\n.sidebar__color-picker input[type=color]::-moz-color-swatch,\n.sidebar__palette-picker input[type=color]::-moz-color-swatch {\n    border: none;\n}\n.sidebar__color-picker input[type=color]::-webkit-color-swatch-wrapper,\n.sidebar__palette-picker input[type=color]::-webkit-color-swatch-wrapper {\n    padding: 0;\n}\n.sidebar__color-picker input[type=color]::-webkit-color-swatch,\n.sidebar__palette-picker input[type=color]::-webkit-color-swatch {\n    border: none;\n    border-radius: 100%;\n}\n\n/*\n * Palette Picker\n */\n.sidebar__palette-picker .sidebar__palette-picker-color-input.first {\n    margin-left: 0;\n}\n.sidebar__palette-picker .sidebar__palette-picker-color-input.last {\n    margin-right: 0;\n}\n.sidebar__palette-picker .sidebar__palette-picker-color-input {\n    margin: 0 4px;\n}\n\n.sidebar__palette-picker .circlebutton {\n    width: 14px;\n    height: 14px;\n    border-radius: 1em;\n    display: inline-block;\n    top: 3px;\n    position: relative;\n}\n\n/*\n * Preset\n */\n.sidebar__item-presets-preset\n{\n    padding:4px;\n    cursor:pointer;\n    padding-left:8px;\n    padding-right:8px;\n    margin-right:4px;\n    background-color:#444;\n}\n\n.sidebar__item-presets-preset:hover\n{\n    background-color:#666;\n}\n\n.sidebar__greyout\n{\n    background: #222;\n    opacity: 0.8;\n    width: 100%;\n    height: 100%;\n    position: absolute;\n    z-index: 1000;\n    right: 0;\n    top: 0;\n}\n\n.sidebar_tabs\n{\n    background-color: #151515;\n    padding-bottom: 0px;\n}\n\n.sidebar_switchs\n{\n    float: right;\n}\n\n.sidebar_tab\n{\n    float:left;\n    background-color: #151515;\n    border-bottom:1px solid transparent;\n    padding-right:7px;\n    padding-left:7px;\n    padding-bottom: 5px;\n    padding-top: 5px;\n    cursor:pointer;\n}\n\n.sidebar_tab_active\n{\n    background-color: #272727;\n    color:white;\n}\n\n.sidebar_tab:hover\n{\n    border-bottom:1px solid #777;\n    color:white;\n}\n\n\n.sidebar_switch\n{\n    float:left;\n    background-color: #444;\n    padding-right:7px;\n    padding-left:7px;\n    padding-bottom: 5px;\n    padding-top: 5px;\n    cursor:pointer;\n}\n\n.sidebar_switch:last-child\n{\n    border-top-right-radius: 7px;\n    border-bottom-right-radius: 7px;\n}\n\n.sidebar_switch:first-child\n{\n    border-top-left-radius: 7px;\n    border-bottom-left-radius: 7px;\n}\n\n\n.sidebar_switch_active\n{\n    background-color: #999;\n    color:white;\n}\n\n.sidebar_switch:hover\n{\n    color:white;\n}\n",};
// vars
const CSS_ELEMENT_CLASS = "cables-sidebar-style"; /* class for the style element to be generated */
const CSS_ELEMENT_DYNAMIC_CLASS = "cables-sidebar-dynamic-style"; /* things which can be set via op-port, but not attached to the elements themselves, e.g. minimized opacity */
const SIDEBAR_CLASS = "sidebar-cables";
const SIDEBAR_ID = "sidebar" + CABLES.uuid();
const SIDEBAR_ITEMS_CLASS = "sidebar__items";
const SIDEBAR_OPEN_CLOSE_BTN_CLASS = "sidebar__close-button";

const BTN_TEXT_OPEN = ""; // 'Close';
const BTN_TEXT_CLOSED = ""; // 'Show Controls';

let openCloseBtn = null;
let openCloseBtnIcon = null;
let headerTitleText = null;

// inputs
const visiblePort = op.inValueBool("Visible", true);
const opacityPort = op.inValueSlider("Opacity", 1);
const defaultMinimizedPort = op.inValueBool("Default Minimized");
const minimizedOpacityPort = op.inValueSlider("Minimized Opacity", 0.5);
const undoButtonPort = op.inValueBool("Show undo button", false);
const inMinimize = op.inValueBool("Show Minimize", false);

const inTitle = op.inString("Title", "Sidebar");
const side = op.inValueBool("Side");

// outputs
const childrenPort = op.outObject("childs");
childrenPort.setUiAttribs({ "title": "Children" });

const isOpenOut = op.outBool("Opfened");
isOpenOut.setUiAttribs({ "title": "Opened" });

let sidebarEl = document.querySelector("." + SIDEBAR_ID);
if (!sidebarEl)
{
    sidebarEl = initSidebarElement();
}
// if(!sidebarEl) return;
const sidebarItemsEl = sidebarEl.querySelector("." + SIDEBAR_ITEMS_CLASS);
childrenPort.set({
    "parentElement": sidebarItemsEl,
    "parentOp": op,
});
onDefaultMinimizedPortChanged();
initSidebarCss();
updateDynamicStyles();

// change listeners
visiblePort.onChange = onVisiblePortChange;
opacityPort.onChange = onOpacityPortChange;
defaultMinimizedPort.onChange = onDefaultMinimizedPortChanged;
minimizedOpacityPort.onChange = onMinimizedOpacityPortChanged;
undoButtonPort.onChange = onUndoButtonChange;
op.onDelete = onDelete;

// functions

function onMinimizedOpacityPortChanged()
{
    updateDynamicStyles();
}

inMinimize.onChange = updateMinimize;

function updateMinimize(header)
{
    if (!header || header.uiAttribs) header = document.querySelector(".sidebar-cables .sidebar__group-header");
    if (!header) return;

    const undoButton = document.querySelector(".sidebar-cables .sidebar__group-header .sidebar__group-header-undo");

    if (inMinimize.get())
    {
        header.classList.add("iconsidebar-chevron-up");
        header.classList.add("iconsidebar-minimizebutton");

        if (undoButton)undoButton.style.marginRight = "20px";
    }
    else
    {
        header.classList.remove("iconsidebar-chevron-up");
        header.classList.remove("iconsidebar-minimizebutton");

        if (undoButton)undoButton.style.marginRight = "initial";
    }
}

side.onChange = function ()
{
    if (side.get()) sidebarEl.classList.add("sidebar-cables-right");
    else sidebarEl.classList.remove("sidebar-cables-right");
};

function onUndoButtonChange()
{
    const header = document.querySelector(".sidebar-cables .sidebar__group-header");
    if (header)
    {
        initUndoButton(header);
    }
}

function initUndoButton(header)
{
    if (header)
    {
        const undoButton = document.querySelector(".sidebar-cables .sidebar__group-header .sidebar__group-header-undo");
        if (undoButton)
        {
            if (!undoButtonPort.get())
            {
                // header.removeChild(undoButton);
                undoButton.remove();
            }
        }
        else
        {
            if (undoButtonPort.get())
            {
                const headerUndo = document.createElement("span");
                headerUndo.classList.add("sidebar__group-header-undo");
                headerUndo.classList.add("sidebar-icon-undo");

                headerUndo.addEventListener("click", function (event)
                {
                    event.stopPropagation();
                    const reloadables = document.querySelectorAll(".sidebar-cables .sidebar__reloadable");
                    const doubleClickEvent = document.createEvent("MouseEvents");
                    doubleClickEvent.initEvent("dblclick", true, true);
                    reloadables.forEach((reloadable) =>
                    {
                        reloadable.dispatchEvent(doubleClickEvent);
                    });
                });
                header.appendChild(headerUndo);
            }
        }
    }
    updateMinimize(header);
}

function onDefaultMinimizedPortChanged()
{
    if (!openCloseBtn) { return; }
    if (defaultMinimizedPort.get())
    {
        sidebarEl.classList.add("sidebar--closed");
        if (visiblePort.get())
        {
            isOpenOut.set(false);
        }
        // openCloseBtn.textContent = BTN_TEXT_CLOSED;
    }
    else
    {
        sidebarEl.classList.remove("sidebar--closed");
        if (visiblePort.get())
        {
            isOpenOut.set(true);
        }
        // openCloseBtn.textContent = BTN_TEXT_OPEN;
    }
}

function onOpacityPortChange()
{
    const opacity = opacityPort.get();
    sidebarEl.style.opacity = opacity;
}

function onVisiblePortChange()
{
    if (visiblePort.get())
    {
        sidebarEl.style.display = "block";
        if (!sidebarEl.classList.contains("sidebar--closed"))
        {
            isOpenOut.set(true);
        }
    }
    else
    {
        sidebarEl.style.display = "none";
        isOpenOut.set(false);
    }
}

side.onChanged = function ()
{

};

/**
 * Some styles cannot be set directly inline, so a dynamic stylesheet is needed.
 * Here hover states can be set later on e.g.
 */
function updateDynamicStyles()
{
    const dynamicStyles = document.querySelectorAll("." + CSS_ELEMENT_DYNAMIC_CLASS);
    if (dynamicStyles)
    {
        dynamicStyles.forEach(function (e)
        {
            e.parentNode.removeChild(e);
        });
    }
    const newDynamicStyle = document.createElement("style");
    newDynamicStyle.classList.add(CSS_ELEMENT_DYNAMIC_CLASS);
    let cssText = ".sidebar--closed .sidebar__close-button { ";
    cssText += "opacity: " + minimizedOpacityPort.get();
    cssText += "}";
    const cssTextEl = document.createTextNode(cssText);
    newDynamicStyle.appendChild(cssTextEl);
    document.body.appendChild(newDynamicStyle);
}

function initSidebarElement()
{
    const element = document.createElement("div");
    element.classList.add(SIDEBAR_CLASS);
    element.classList.add(SIDEBAR_ID);
    const canvasWrapper = op.patch.cgl.canvas.parentElement; /* maybe this is bad outside cables!? */

    // header...
    const headerGroup = document.createElement("div");
    headerGroup.classList.add("sidebar__group");

    element.appendChild(headerGroup);
    const header = document.createElement("div");
    header.classList.add("sidebar__group-header");

    element.appendChild(header);
    const headerTitle = document.createElement("span");
    headerTitle.classList.add("sidebar__group-header-title");
    headerTitleText = document.createElement("span");
    headerTitleText.classList.add("sidebar__group-header-title-text");
    headerTitleText.innerHTML = inTitle.get();
    headerTitle.appendChild(headerTitleText);
    header.appendChild(headerTitle);

    initUndoButton(header);
    updateMinimize(header);

    headerGroup.appendChild(header);
    element.appendChild(headerGroup);
    headerGroup.addEventListener("click", onOpenCloseBtnClick);

    if (!canvasWrapper)
    {
        op.warn("[sidebar] no canvas parentelement found...");
        return;
    }
    canvasWrapper.appendChild(element);
    const items = document.createElement("div");
    items.classList.add(SIDEBAR_ITEMS_CLASS);
    element.appendChild(items);
    openCloseBtn = document.createElement("div");
    openCloseBtn.classList.add(SIDEBAR_OPEN_CLOSE_BTN_CLASS);
    openCloseBtn.addEventListener("click", onOpenCloseBtnClick);
    // openCloseBtn.textContent = BTN_TEXT_OPEN;
    element.appendChild(openCloseBtn);
    // openCloseBtnIcon = document.createElement("span");

    // openCloseBtnIcon.classList.add("sidebar__close-button-icon");
    // openCloseBtnIcon.classList.add("iconsidebar-chevron-up");

    // openCloseBtn.appendChild(openCloseBtnIcon);

    return element;
}

inTitle.onChange = function ()
{
    if (headerTitleText)headerTitleText.innerHTML = inTitle.get();
};

function setClosed(b)
{

}

function onOpenCloseBtnClick(ev)
{
    ev.stopPropagation();
    if (!sidebarEl) { op.logError("Sidebar could not be closed..."); return; }
    sidebarEl.classList.toggle("sidebar--closed");
    const btn = ev.target;
    let btnText = BTN_TEXT_OPEN;
    if (sidebarEl.classList.contains("sidebar--closed"))
    {
        btnText = BTN_TEXT_CLOSED;
        isOpenOut.set(false);
    }
    else
    {
        isOpenOut.set(true);
    }
}

function initSidebarCss()
{
    // var cssEl = document.getElementById(CSS_ELEMENT_ID);
    const cssElements = document.querySelectorAll("." + CSS_ELEMENT_CLASS);
    // remove old script tag
    if (cssElements)
    {
        cssElements.forEach(function (e)
        {
            e.parentNode.removeChild(e);
        });
    }
    const newStyle = document.createElement("style");
    newStyle.innerHTML = attachments.style_css;
    newStyle.classList.add(CSS_ELEMENT_CLASS);
    document.body.appendChild(newStyle);
}

function onDelete()
{
    removeElementFromDOM(sidebarEl);
}

function removeElementFromDOM(el)
{
    if (el && el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
}


};

Ops.Sidebar.Sidebar.prototype = new CABLES.Op();
CABLES.OPS["5a681c35-78ce-4cb3-9858-bc79c34c6819"]={f:Ops.Sidebar.Sidebar,objName:"Ops.Sidebar.Sidebar"};




// **************************************************************
// 
// Ops.Sidebar.SidebarText_v2
// 
// **************************************************************

Ops.Sidebar.SidebarText_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
// inputs
const parentPort = op.inObject("link");
const labelPort = op.inString("Text", "Value");
const inId = op.inValueString("Id", "");

// outputs
const siblingsPort = op.outObject("childs");

// vars
const el = document.createElement("div");
el.dataset.op = op.id;
el.classList.add("cablesEle");
el.classList.add("sidebar__item");
el.classList.add("sidebar__text");
const label = document.createElement("div");
label.classList.add("sidebar__item-label");
const labelText = document.createElement("div");// document.createTextNode(labelPort.get());
label.appendChild(labelText);
el.appendChild(label);

// events
parentPort.onChange = onParentChanged;
labelPort.onChange = onLabelTextChanged;
inId.onChange = onIdChanged;
op.onDelete = onDelete;

op.toWorkNeedsParent("Ops.Sidebar.Sidebar");

// functions

function onIdChanged()
{
    el.id = inId.get();
}

function onLabelTextChanged()
{
    const labelText = labelPort.get();
    label.innerHTML = labelText;
    if (CABLES.UI)
    {
        if (labelText && typeof labelText === "string")
        {
            op.setTitle("Text: " + labelText.substring(0, 10)); // display first 10 characters of text in op title
        }
        else
        {
            op.setTitle("Text");
        }
    }
}

function onParentChanged()
{
    siblingsPort.set(null);
    const parent = parentPort.get();
    if (parent && parent.parentElement)
    {
        parent.parentElement.appendChild(el);
        siblingsPort.set(parent);
    }
    else
    { // detach
        if (el.parentElement)
        {
            el.parentElement.removeChild(el);
        }
    }
}

function showElement(el)
{
    if (el)
    {
        el.style.display = "block";
    }
}

function hideElement(el)
{
    if (el)
    {
        el.style.display = "none";
    }
}

function onDelete()
{
    removeElementFromDOM(el);
}

function removeElementFromDOM(el)
{
    if (el && el.parentNode && el.parentNode.removeChild)
    {
        el.parentNode.removeChild(el);
    }
}


};

Ops.Sidebar.SidebarText_v2.prototype = new CABLES.Op();
CABLES.OPS["cc591cc3-ff23-4817-907c-e5be7d5c059d"]={f:Ops.Sidebar.SidebarText_v2,objName:"Ops.Sidebar.SidebarText_v2"};




// **************************************************************
// 
// Ops.Sidebar.SideBarStyle
// 
// **************************************************************

Ops.Sidebar.SideBarStyle = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const parentPort = op.inObject("link"),
    inWidth = op.inInt("Width", 220),
    inBorderRadius = op.inFloat("Round Corners", 10),
    inColorSpecial = op.inString("Special Color", "#07f78c"),

    siblingsPort = op.outObject("childs");

inColorSpecial.onChange =
inBorderRadius.onChange =
inWidth.onChange = setStyle;

parentPort.onChange = onParentChanged;
op.onDelete = onDelete;

op.toWorkNeedsParent("Ops.Sidebar.Sidebar");

let sideBarEle = null;

function setStyle()
{
    if (!sideBarEle) return;

    sideBarEle.style.setProperty("--sidebar-width", inWidth.get() + "px");

    sideBarEle.style.setProperty("--sidebar-color", inColorSpecial.get());

    sideBarEle.style.setProperty("--sidebar-border-radius", Math.round(inBorderRadius.get()) + "px");

    op.patch.emitEvent("sidebarStylesChanged");
}

function onParentChanged()
{
    siblingsPort.set(null);
    const parent = parentPort.get();
    if (parent && parent.parentElement)
    {
        siblingsPort.set(parent);
        sideBarEle = parent.parentElement.parentElement;
        setStyle();
    }
    else
    {
        sideBarEle = null;
    }
}

function showElement(el)
{
    if (!el) return;
    el.style.display = "block";
}

function hideElement(el)
{
    if (!el) return;
    el.style.display = "none";
}

function onDelete()
{
}


};

Ops.Sidebar.SideBarStyle.prototype = new CABLES.Op();
CABLES.OPS["87d78a59-c8d4-4269-a3f8-af273741aae4"]={f:Ops.Sidebar.SideBarStyle,objName:"Ops.Sidebar.SideBarStyle"};




// **************************************************************
// 
// Ops.Sidebar.TextInput_v2
// 
// **************************************************************

Ops.Sidebar.TextInput_v2 = function()
{
CABLES.Op.apply(this,arguments);
const op=this;
const attachments={};
const
    parentPort = op.inObject("Link"),
    labelPort = op.inString("Text", "Text"),
    defaultValuePort = op.inString("Default", ""),
    inPlaceholder = op.inString("Placeholder", ""),
    inType = op.inSwitch("Type", ["text", "password"], "text"),
    inTextArea = op.inBool("TextArea", false),
    inGreyOut = op.inBool("Grey Out", false),
    inVisible = op.inBool("Visible", true),
    inClear = op.inTriggerButton("Clear"),
    siblingsPort = op.outObject("Children"),
    valuePort = op.outString("Result", defaultValuePort.get()),
    outFocus = op.outBool("Focus");

const el = document.createElement("div");
el.dataset.op = op.id;
el.classList.add("cablesEle");
el.classList.add("sidebar__item");
el.classList.add("sidebar__text-input");
el.classList.add("sidebar__reloadable");

const label = document.createElement("div");
label.classList.add("sidebar__item-label");
const labelText = document.createTextNode(labelPort.get());
label.appendChild(labelText);
el.appendChild(label);

label.addEventListener("dblclick", function ()
{
    valuePort.set(defaultValuePort.get());
    input.value = defaultValuePort.get();
});

let input = null;
creatElement();

op.toWorkPortsNeedToBeLinked(parentPort);

inTextArea.onChange = creatElement;
inType.onChange = setAttribs;

function setAttribs()
{
    input.setAttribute("type", inType.get());
    input.setAttribute("value", defaultValuePort.get());
    input.setAttribute("placeholder", inPlaceholder.get());
}

function creatElement()
{
    if (input)input.remove();
    if (!inTextArea.get())
    {
        input = document.createElement("input");
    }
    else
    {
        input = document.createElement("textarea");
        onDefaultValueChanged();
    }

    input.classList.add("sidebar__text-input-input");

    setAttribs();

    el.appendChild(input);
    input.addEventListener("input", onInput);
    input.addEventListener("focus", onFocus);
    input.addEventListener("blur", onBlur);
}

const greyOut = document.createElement("div");
greyOut.classList.add("sidebar__greyout");
el.appendChild(greyOut);
greyOut.style.display = "none";

inClear.onTriggered = () =>
{
    input.value = "";
};

function onFocus()
{
    outFocus.set(true);
}

function onBlur()
{
    outFocus.set(false);
}

inPlaceholder.onChange = () =>
{
    input.setAttribute("placeholder", inPlaceholder.get());
};

inGreyOut.onChange = function ()
{
    greyOut.style.display = inGreyOut.get() ? "block" : "none";
};

inVisible.onChange = function ()
{
    el.style.display = inVisible.get() ? "block" : "none";
};

// events
parentPort.onChange = onParentChanged;
labelPort.onChange = onLabelTextChanged;
defaultValuePort.onChange = onDefaultValueChanged;
op.onDelete = onDelete;

// functions

function onInput(ev)
{
    valuePort.set(ev.target.value);
}

function onDefaultValueChanged()
{
    const defaultValue = defaultValuePort.get();
    valuePort.set(defaultValue);
    input.value = defaultValue;
}

function onLabelTextChanged()
{
    const labelText = labelPort.get();
    label.textContent = labelText;
    if (CABLES.UI)
    {
        op.setTitle("Text Input: " + labelText);
    }
}

function onParentChanged()
{
    siblingsPort.set(null);
    const parent = parentPort.get();
    if (parent && parent.parentElement)
    {
        parent.parentElement.appendChild(el);
        siblingsPort.set(parent);
    }
    else
    { // detach
        if (el.parentElement)
        {
            el.parentElement.removeChild(el);
        }
    }
}

function showElement(el)
{
    if (el)
    {
        el.style.display = "block";
    }
}

function hideElement(el)
{
    if (el)
    {
        el.style.display = "none";
    }
}

function onDelete()
{
    removeElementFromDOM(el);
}

function removeElementFromDOM(el)
{
    if (el && el.parentNode && el.parentNode.removeChild)
    {
        el.parentNode.removeChild(el);
    }
}


};

Ops.Sidebar.TextInput_v2.prototype = new CABLES.Op();
CABLES.OPS["6538a190-e73c-451b-964e-d010ee267aa9"]={f:Ops.Sidebar.TextInput_v2,objName:"Ops.Sidebar.TextInput_v2"};



window.addEventListener('load', function(event) {
CABLES.jsLoaded=new Event('CABLES.jsLoaded');
document.dispatchEvent(CABLES.jsLoaded);
});
