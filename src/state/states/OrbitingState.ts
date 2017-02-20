import {
    IState,
    StateBase,
    IRotation,
    TraversingState,
    WaitingState,
} from "../../State";

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

    public move(delta: number): void { /*noop*/ }

    public moveTo(position: number): void { /*noop*/ }

    public rotate(delta: IRotation): void { /*noop*/ }

    public rotateBasic(basicRotation: number[]): void { /*noop*/ }

    public rotateBasicUnbounded(basicRotation: number[]): void { /*noop*/ }

    public rotateToBasic(basic: number[]): void { /*noop*/ }

    public zoomIn(delta: number, reference: number[]): void { /*noop*/ }

    public update(fps: number): void {
        this._camera.copy(this._currentCamera);
     }

    public setCenter(center: number[]): void { /*noop*/ }

    public setZoom(zoom: number): void { /*noop*/ }

    protected _getAlpha(): number {
        return 1;
    }
}

export default OrbitingState;
