import {Observable} from "rxjs/Observable";
import {Subscription} from "rxjs/Subscription";

import {
    Component,
    IMouseConfiguration,
    HandlerBase,
} from "../../Component";
import {ViewportCoords} from "../../Geo";
import {RenderCamera} from "../../Render";
import {
    IRotation,
    State,
} from "../../State";
import {
    Container,
    Navigator,
} from "../../Viewer";

export class FlyHandler extends HandlerBase<IMouseConfiguration> {
    private _viewportCoords: ViewportCoords;

    private _flyMovementSubscription: Subscription;
    private _flyMouseWheelSubscription: Subscription;

    constructor(
        component: Component<IMouseConfiguration>,
        container: Container,
        navigator: Navigator,
        viewportCoords: ViewportCoords) {
        super(component, container, navigator);

        this._viewportCoords = viewportCoords;
    }

    protected _enable(): void {
        const flying$: Observable<boolean> = this._navigator.stateService.state$
            .map(
                (state: State): boolean => {
                    return state === State.Flying;
                })
            .publishReplay(1)
            .refCount();

        const mouseDrag$: Observable<[MouseEvent, MouseEvent]> = Observable
            .merge(
                this._container.mouseService.filtered$(this._component.name, this._container.mouseService.mouseDragStart$),
                this._container.mouseService.filtered$(this._component.name, this._container.mouseService.mouseDrag$),
                this._container.mouseService.filtered$(this._component.name, this._container.mouseService.mouseDragEnd$)
                    .map((e: MouseEvent): MouseEvent => { return null; }))
            .pairwise()
            .filter(
                (pair: [MouseEvent, MouseEvent]): boolean => {
                    return pair[0] != null && pair[1] != null;
                });

        this._flyMovementSubscription = flying$
            .switchMap(
                (flying: boolean): Observable<[MouseEvent, MouseEvent]> => {
                    return flying ?
                        mouseDrag$ :
                        Observable.empty<[MouseEvent, MouseEvent]>();
                })
            .withLatestFrom(this._container.renderService.renderCamera$)
            .subscribe(
                ([events, camera]: [[MouseEvent, MouseEvent], RenderCamera]): void => {
                    this._processFlyMovement(events, camera);
                });

        this._flyMouseWheelSubscription = flying$
            .switchMap(
                (flying: boolean): Observable<WheelEvent> => {
                    return flying ?
                        this._container.mouseService
                            .filtered$(this._component.name, this._container.mouseService.mouseWheel$) :
                        Observable.empty<WheelEvent>();
                })
            .subscribe(
                (event: WheelEvent): void => {
                    this._navigator.stateService.dolly(event.wheelDelta * 0.001);
                });
    }

    protected _disable(): void {
        this._flyMovementSubscription.unsubscribe();
        this._flyMouseWheelSubscription.unsubscribe();
    }

    protected _getConfiguration(enable: boolean): IMouseConfiguration {
        return {};
    }

    private _orbitDeltaFromMovement(events: [MouseEvent, MouseEvent], camera: RenderCamera): IRotation {
        let element: HTMLElement = this._container.element;
        let size: number = Math.max(element.offsetWidth, element.offsetHeight);

        let previousEvent: MouseEvent = events[0];
        let event: MouseEvent = events[1];

        let movementX: number = event.clientX - previousEvent.clientX;
        let movementY: number = event.clientY - previousEvent.clientY;

        return {
            phi: -Math.PI * movementX / size,
            theta: -Math.PI * movementY / size,
        };
    }

    private _processFlyMovement(events: [MouseEvent, MouseEvent], camera: RenderCamera): void {
        const event: MouseEvent = events[1];
        if (event.shiftKey) {
            this._navigator.stateService.truck(this._truckDeltaFromMovement(events, camera));
        } else {
            if (event.ctrlKey || event.metaKey) {
                this._navigator.stateService.orbit(this._orbitDeltaFromMovement(events, camera));
            } else {
                this._navigator.stateService.rotate(this._rotationDeltaFromMovement(events, camera));
            }
        }
    }

    private _rotationDeltaFromMovement(events: [MouseEvent, MouseEvent], r: RenderCamera): IRotation {
        let element: HTMLElement = this._container.element;

        let previousEvent: MouseEvent | Touch = events[0];
        let event: MouseEvent | Touch = events[1];

        let movementX: number = event.clientX - previousEvent.clientX;
        let movementY: number = event.clientY - previousEvent.clientY;

        let [canvasX, canvasY]: number[] = this._viewportCoords.canvasPosition(event, element);

        let direction: THREE.Vector3 =
            this._viewportCoords.unprojectFromCanvas(canvasX, canvasY, element, r.perspective)
            .sub(r.perspective.position);

        let directionX: THREE.Vector3 =
            this._viewportCoords.unprojectFromCanvas(canvasX - movementX, canvasY, element, r.perspective)
            .sub(r.perspective.position);

        let directionY: THREE.Vector3 =
            this._viewportCoords.unprojectFromCanvas(canvasX, canvasY - movementY, element, r.perspective)
            .sub(r.perspective.position);

        let phi: number = (movementX > 0 ? 1 : -1) * directionX.angleTo(direction);
        let theta: number = (movementY > 0 ? -1 : 1) * directionY.angleTo(direction);

        return { phi: phi, theta: theta };
    }

    private _truckDeltaFromMovement(events: [MouseEvent, MouseEvent], camera: RenderCamera): number[] {
        let element: HTMLElement = this._container.element;
        let size: number = Math.max(element.offsetWidth, element.offsetHeight);

        let previousEvent: MouseEvent | Touch = events[0];
        let event: MouseEvent | Touch = events[1];

        let movementX: number = event.clientX - previousEvent.clientX;
        let movementY: number = event.clientY - previousEvent.clientY;

        return [movementX / size, movementY / size];
    }
}

export default FlyHandler;
