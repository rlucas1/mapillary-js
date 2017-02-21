import * as THREE from "three";
import {
    IState,
    StateBase,
    IRotation,
    TraversingState,
    WaitingState,
} from "../../State";
import {
    Camera,
    Transform,
} from "../../Geo";

export class OrbitingState extends StateBase {
    constructor(state: IState) {
        super(state);
    }

    public orbit(): StateBase {
        throw new Error("Not implemented");
    }

    public traverse(): StateBase {
        return new TraversingState(this);
    }

    public wait(): StateBase {
        return new WaitingState(this);
    }

    public move(delta: number): void {
        throw new Error("Not implemented");
    }

    public moveTo(position: number): void {
        throw new Error("Not implemented");
    }

    public rotate(delta: IRotation): void {
        console.log('rotate');
        this._applyRotation(this._currentCamera, delta);
    }

    public rotateBasic(basicRotation: number[]): void {
        console.log('rotateBasic');
        throw new Error("Not implemented");
    }

    public rotateBasicUnbounded(basicRotation: number[]): void {
        console.log('rotateBasicUnbounded');
    }

    public rotateToBasic(basic: number[]): void {
        console.log('rotateToBasic');
    }

    public zoomIn(delta: number, reference: number[]): void { /*noop*/ }

    public update(fps: number): void {
        this._camera.copy(this._currentCamera);
     }

    public setCenter(center: number[]): void { /*noop*/ }

    public setZoom(zoom: number): void { /*noop*/ }

    protected _getAlpha(): number {
        return 1;
    }

    private _applyRotation(camera: Camera, rotation: IRotation): void {
        if (camera == null) {
            return;
        }

        let q: THREE.Quaternion = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3( 0, 0, 1 ));
        let qInverse: THREE.Quaternion = q.clone().inverse();

        let offset: THREE.Vector3 = new THREE.Vector3();
        offset.copy(camera.lookat).sub(camera.position);
        offset.applyQuaternion(q);
        let length: number = offset.length();

        let phi: number = Math.atan2(offset.y, offset.x);
        phi += rotation.phi;

        let theta: number = Math.atan2(Math.sqrt(offset.x * offset.x + offset.y * offset.y), offset.z);
        theta += rotation.theta;
        theta = Math.max(0.1, Math.min(Math.PI - 0.1, theta));

        offset.x = Math.sin(theta) * Math.cos(phi);
        offset.y = Math.sin(theta) * Math.sin(phi);
        offset.z = Math.cos(theta);
        offset.applyQuaternion(qInverse);

        camera.lookat.copy(camera.position).add(offset.multiplyScalar(length));
    }
}

export default OrbitingState;
