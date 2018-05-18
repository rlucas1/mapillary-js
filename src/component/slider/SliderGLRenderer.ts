import * as THREE from "three";

import {
    IBBoxShaderMaterial,
    IShaderMaterial,
    MeshFactory,
    MeshScene,
    SliderMode,
} from "../../Component";
import { Node } from "../../Graph";
import {
    ICurrentState,
    IFrame,
} from "../../State";
import {
    Transform,
    Spatial,
} from "../../Geo";

export class SliderGLRenderer {
    private _factory: MeshFactory;
    private _scene: MeshScene;
    private _spatial: Spatial;

    private _currentKey: string;
    private _previousKey: string;

    private _disabled: boolean;
    private _curtain: number;
    private _frameId: number;
    private _needsRender: boolean;

    private _mode: SliderMode;

    constructor() {
        this._factory = new MeshFactory();
        this._scene = new MeshScene();
        this._spatial = new Spatial();

        this._currentKey = null;
        this._previousKey = null;

        this._disabled = false;
        this._curtain = 1;
        this._frameId = 0;
        this._needsRender = false;

        this._mode = null;
    }

    public get disabled(): boolean {
        return this._disabled;
    }

    public get frameId(): number {
        return this._frameId;
    }

    public get needsRender(): boolean {
        return this._needsRender;
    }

    public update(frame: IFrame, mode: SliderMode): void {
        this._updateFrameId(frame.id);
        this._updateImagePlanes(frame.state, mode);
    }

    public updateCurtain(curtain: number): void {
        if (this._curtain === curtain) {
            return;
        }

        this._curtain = curtain;
        this._updateCurtain();

        this._needsRender = true;
    }

    public updateTexture(image: HTMLImageElement, node: Node): void {
        let imagePlanes: THREE.Mesh[] = node.key === this._currentKey ?
            this._scene.imagePlanes :
            node.key === this._previousKey ?
                this._scene.imagePlanesOld :
                [];

        if (imagePlanes.length === 0) {
            return;
        }

        this._needsRender = true;

        for (let plane of imagePlanes) {
            let material: IShaderMaterial = <IShaderMaterial>plane.material;
            let texture: THREE.Texture = <THREE.Texture>material.uniforms.projectorTex.value;

            texture.image = image;
            texture.needsUpdate = true;
        }
    }

    public render(
        perspectiveCamera: THREE.PerspectiveCamera,
        renderer: THREE.WebGLRenderer): void {

        if (!this.disabled) {
            renderer.render(this._scene.sceneOld, perspectiveCamera);
        }

        renderer.render(this._scene.scene, perspectiveCamera);

        this._needsRender = false;
    }

    public dispose(): void {
        this._scene.clear();
    }

    private _setDisabled(state: ICurrentState): void {
        this._disabled = state.currentNode == null ||
            state.previousNode == null ||
            (state.currentNode.pano && !state.currentNode.fullPano) ||
            (state.previousNode.pano && !state.previousNode.fullPano) ||
            (state.currentNode.fullPano && !state.previousNode.fullPano);
    }

    private _updateCurtain(): void {
        for (let plane of this._scene.imagePlanes) {
            let shaderMaterial: IBBoxShaderMaterial = <IBBoxShaderMaterial>plane.material;

            if (!!shaderMaterial.uniforms.curtain) {
                shaderMaterial.uniforms.curtain.value = this._curtain;
            }
        }
    }

    private _updateFrameId(frameId: number): void {
        this._frameId = frameId;
    }

    private _updateImagePlanes(state: ICurrentState, mode: SliderMode): void {
        const currentChanged: boolean = state.currentNode != null && this._currentKey !== state.currentNode.key;
        const previousChanged: boolean = state.previousNode != null && this._previousKey !== state.previousNode.key;
        const modeChanged: boolean = this._mode !== mode;

        if (!(currentChanged || previousChanged || modeChanged)) {
            return;
        }

        this._setDisabled(state);
        this._needsRender = true;
        this._mode = mode;

        const motionless: boolean = state.motionless || mode === SliderMode.Stationary || state.currentNode.pano;

        if (this.disabled) {
            this._scene.setImagePlanesOld([]);
        } else {
            if (previousChanged || modeChanged) {
                const previousNode: Node = state.previousNode;

                this._previousKey = previousNode.key;

                const elements: Float32Array = state.currentTransform.rt.elements;
                let translation: number[] = [elements[12], elements[13], elements[14]];

                const currentAspect: number = state.currentTransform.basicAspect;
                const previousAspect: number = state.previousTransform.basicAspect;

                const textureScale: number[] = currentAspect > previousAspect ?
                    [1, previousAspect / currentAspect] :
                    [currentAspect / previousAspect, 1];

                let rotation: number[] = state.currentNode.rotation;

                if (previousNode.fullPano) {
                    rotation = state.previousNode.rotation;
                    translation = this._spatial
                        .rotate(
                            this._spatial
                                .opticalCenter(state.currentNode.rotation, translation)
                                .toArray(),
                            rotation)
                        .multiplyScalar(-1)
                        .toArray();
                }

                const transform: Transform = new Transform(
                    state.currentNode.orientation,
                    state.currentNode.width,
                    state.currentNode.height,
                    state.currentNode.focal,
                    state.currentNode.scale,
                    previousNode.gpano,
                    rotation,
                    translation,
                    previousNode.image,
                    textureScale);

                let mesh: THREE.Mesh = undefined;

                if (previousNode.fullPano) {
                    mesh = this._factory.createMesh(
                        previousNode,
                        motionless || state.currentNode.fullPano ? transform : state.previousTransform);
                } else {
                    if (motionless) {
                        const [[basicX0, basicY0], [basicX1, basicY1]]: number[][] = this._getBasicCorners(currentAspect, previousAspect);

                        mesh = this._factory.createFlatMesh(
                            state.previousNode,
                            transform,
                            basicX0,
                            basicX1,
                            basicY0,
                            basicY1);
                    } else {
                        mesh = this._factory.createMesh(state.previousNode, state.previousTransform);
                    }
                }

                this._scene.setImagePlanesOld([mesh]);
            }
        }

        if (currentChanged) {
            this._currentKey = state.currentNode.key;

            const imagePlane: THREE.Mesh = state.currentNode.pano && !state.currentNode.fullPano ?
                this._factory.createMesh(state.currentNode, state.currentTransform) :
                this._factory.createCurtainMesh(state.currentNode, state.currentTransform);

            this._scene.setImagePlanes([imagePlane]);

            this._updateCurtain();
        }
    }

    private _getBasicCorners(currentAspect: number, previousAspect: number): number[][] {
        let offsetX: number;
        let offsetY: number;

        if (currentAspect > previousAspect) {
            offsetX = 0.5;
            offsetY = 0.5 * currentAspect / previousAspect;
        } else {
            offsetX = 0.5 * previousAspect / currentAspect;
            offsetY = 0.5;
        }

        return [[0.5 - offsetX, 0.5 - offsetY], [0.5 + offsetX, 0.5 + offsetY]];
    }
}

export default SliderGLRenderer;