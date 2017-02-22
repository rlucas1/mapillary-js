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
} from "../../Geo";


export class FlyingState extends StateBase {
    constructor(state: IState) {
        super(state);
    }

    public traverse(): StateBase {
        return new TraversingState(this);
    }

    public wait(): StateBase {
        return new WaitingState(this);
    }

    public rotate(delta: IRotation): void {
        this._applyRotation(this._camera, delta);
    }

    public dolly(delta: number): void {
        this._applyDolly(this._camera, delta);
    }

    public truck(delta: number[]): void {
        this._applyTruck(this._camera, delta);
    }

    public orbit(delta: IRotation): void {
        this._applyOribit(this._camera, delta);
    }

    public update(fps: number): void { /*noop*/ }

    protected _getAlpha(): number {
        return 1;
    }

    protected _setCurrentCamera(): void {
        super._setCurrentCamera();

        this._camera.copy(this._currentCamera);
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

    private _applyOribit(camera: Camera, rotation: IRotation): void {
        if (camera == null) {
            return;
        }

        let q: THREE.Quaternion = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3( 0, 0, 1 ));
        let qInverse: THREE.Quaternion = q.clone().inverse();

        let offset: THREE.Vector3 = new THREE.Vector3();
        offset.copy(camera.position).sub(camera.lookat);
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

        camera.position.copy(camera.lookat).add(offset.multiplyScalar(length));
    }

    private _applyTruck(camera: Camera, delta: number[]): void {
        let offset: THREE.Vector3 = new THREE.Vector3();
        offset.copy(camera.lookat).sub(camera.position);
        let length: number = offset.length();

        let vx: THREE.Vector3 = new THREE.Vector3();
        vx.copy(offset).cross(camera.up).normalize();
        let vy: THREE.Vector3 = new THREE.Vector3();
        vy.copy(offset).cross(vx).normalize();

        vx.multiplyScalar(-delta[0] * length);
        vy.multiplyScalar(-delta[1] * length);

        camera.lookat.add(vx);
        camera.lookat.add(vy);
        camera.position.add(vx);
        camera.position.add(vy);
    }

    private _applyDolly(camera: Camera, delta: number): void {
        let offset: THREE.Vector3 = new THREE.Vector3();
        offset.copy(camera.position).sub(camera.lookat);
        let length: number = offset.length();
        let scaled: number = length * Math.pow(2, -delta);
        let clipped: number = Math.max(1, Math.min(scaled, 1000));
        offset.normalize();
        offset.multiplyScalar(clipped);
        camera.position.copy(camera.lookat).add(offset);
    }
}

export default FlyingState;
