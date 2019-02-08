#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D projectorTex;
uniform float opacity;
uniform float phiLength;
uniform float phiShift;
uniform float thetaLength;
uniform float thetaShift;

varying vec4 vRstq;
varying vec4 cameraCoords;

void main()
{
    vec3 b = normalize(vRstq.xyz);
    float lat = -asin(b.y);
    float lon = atan(b.x, b.z);
    float x = (lon - phiShift) / phiLength + 0.5;
    float y = (lat - thetaShift) / thetaLength + 0.5;
    vec4 baseColor = texture2D(projectorTex, vec2(x, y));
    baseColor.a = opacity;

    float xx = cameraCoords.x * 5.0;
    if (xx - floor(xx) < 0.1) {
        baseColor.r = 1.0;
    }
    gl_FragColor = baseColor;
}