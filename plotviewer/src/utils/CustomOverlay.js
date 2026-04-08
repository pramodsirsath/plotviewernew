export function createCustomOverlayClass(googleMaps) {
  class CustomMapOverlay extends googleMaps.OverlayView {
    constructor(bounds, imageSrc, opacity, rotation, scale, onDragEnd, options = {}) {
      super();
      this.bounds_ = bounds;
      this.imageSrc_ = imageSrc;
      this.opacity_ = opacity;
      this.rotation_ = rotation;
      this.scale_ = scale;
      this.onDragEnd_ = onDragEnd;
      this.draggable_ = options.draggable ?? true;
      this.div_ = null;

      this.isDragging_ = false;
      this.dragStartPixel_ = null;
      this.startBounds_ = null;
      this.pointerId_ = null;
      this.pendingDrawFrame_ = null;
      
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.scheduleDraw = this.scheduleDraw.bind(this);
    }

    onAdd() {
      this.div_ = document.createElement("div");
      this.div_.style.position = "absolute";
      this.div_.style.cursor = this.draggable_ ? "move" : "default";
      this.div_.style.pointerEvents = this.draggable_ ? "auto" : "none";
      this.div_.style.touchAction = "none";
      this.div_.style.willChange = "left, top, width, height, transform, opacity";

      const img = document.createElement("img");
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.position = "absolute";
      img.style.inset = "0";
      img.style.display = "block";
      img.style.pointerEvents = "none"; // Let the container handle events
      img.draggable = false;
      img.addEventListener("load", this.scheduleDraw);
      img.src = this.imageSrc_;
      if (img.complete) {
        this.scheduleDraw();
      }
      
      this.div_.appendChild(img);
      const panes = this.getPanes();
      panes.overlayMouseTarget.appendChild(this.div_);

      if (this.draggable_) {
        this.div_.addEventListener("pointerdown", this.handlePointerDown);
      }

      this.scheduleDraw();
    }

    scheduleDraw() {
      if (this.pendingDrawFrame_) {
        cancelAnimationFrame(this.pendingDrawFrame_);
      }

      this.pendingDrawFrame_ = requestAnimationFrame(() => {
        this.pendingDrawFrame_ = null;
        this.draw();
      });
    }

    handlePointerDown(e) {
      if (!this.draggable_) {
        return;
      }

      // Prevent Google Maps from panning when we drag the overlay
      e.preventDefault();
      e.stopPropagation();
      this.isDragging_ = true;
      this.dragStartPixel_ = { x: e.clientX, y: e.clientY };
      this.startBounds_ = this.bounds_;
      this.pointerId_ = e.pointerId;
      
      const map = this.getMap();
      if (map) map.setOptions({ draggable: false }); // Disable map drag

      if (this.div_?.setPointerCapture && e.pointerId !== undefined) {
        this.div_.setPointerCapture(e.pointerId);
      }

      document.addEventListener("pointermove", this.handlePointerMove);
      document.addEventListener("pointerup", this.handlePointerUp);
    }

    handlePointerMove(e) {
      if (!this.isDragging_ || !this.getProjection()) return;
      e.preventDefault();
      e.stopPropagation();
      
      const dx = e.clientX - this.dragStartPixel_.x;
      const dy = e.clientY - this.dragStartPixel_.y;

      const proj = this.getProjection();
      
      // Calculate original points in pixels
      const swPix = proj.fromLatLngToDivPixel(this.startBounds_.getSouthWest());
      const nePix = proj.fromLatLngToDivPixel(this.startBounds_.getNorthEast());
      
      // Apply delta
      swPix.x += dx; swPix.y += dy;
      nePix.x += dx; nePix.y += dy;

      // Back to LatLng
      const newSw = proj.fromDivPixelToLatLng(swPix);
      const newNe = proj.fromDivPixelToLatLng(nePix);

      this.bounds_ = new googleMaps.LatLngBounds(newSw, newNe);
      this.draw();
    }

    handlePointerUp(e) {
      if (!this.isDragging_) return;
      e.preventDefault();
      this.isDragging_ = false;
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);

      const map = this.getMap();
      if (map) map.setOptions({ draggable: true }); // Re-enable map drag

      if (this.div_?.releasePointerCapture && this.pointerId_ !== null) {
        try {
          this.div_.releasePointerCapture(this.pointerId_);
        } catch {
          // Ignore release errors if the capture was already lost.
        }
      }
      this.pointerId_ = null;

      if (this.onDragEnd_) {
        // Compute new center to return
        const lat = (this.bounds_.getNorthEast().lat() + this.bounds_.getSouthWest().lat()) / 2;
        const lng = (this.bounds_.getNorthEast().lng() + this.bounds_.getSouthWest().lng()) / 2;
        this.onDragEnd_({ lat, lng }, this.bounds_);
      }
    }

    draw() {
      const overlayProjection = this.getProjection();
      if (!this.div_) return;
      if (!overlayProjection) {
        this.scheduleDraw();
        return;
      }
      const sw = overlayProjection.fromLatLngToDivPixel(this.bounds_.getSouthWest());
      const ne = overlayProjection.fromLatLngToDivPixel(this.bounds_.getNorthEast());

      this.div_.style.left = sw.x + "px";
      this.div_.style.top = ne.y + "px";
      this.div_.style.width = (ne.x - sw.x) + "px";
      this.div_.style.height = (sw.y - ne.y) + "px";
      this.div_.style.opacity = this.opacity_;
      this.div_.style.transform = `scale(${this.scale_}) rotate(${this.rotation_}deg)`;
      this.div_.style.transformOrigin = "center center";
    }

    onRemove() {
      if (this.div_) {
        if (this.draggable_) {
          this.div_.removeEventListener("pointerdown", this.handlePointerDown);
        }
        const image = this.div_.querySelector("img");
        image?.removeEventListener("load", this.scheduleDraw);
        this.div_.parentNode.removeChild(this.div_);
        this.div_ = null;
      }
      if (this.pendingDrawFrame_) {
        cancelAnimationFrame(this.pendingDrawFrame_);
        this.pendingDrawFrame_ = null;
      }
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
    }

    updateConfig(options) {
      if (options.opacity !== undefined) this.opacity_ = options.opacity;
      if (options.rotation !== undefined) this.rotation_ = options.rotation;
      if (options.scale !== undefined) this.scale_ = options.scale;
      if (options.draggable !== undefined) {
        this.draggable_ = options.draggable;
        if (this.div_) {
          this.div_.style.cursor = this.draggable_ ? "move" : "default";
          this.div_.style.pointerEvents = this.draggable_ ? "auto" : "none";
        }
      }
      if (options.bounds !== undefined) {
          // Only update bounds externally if NOT dragging.
          if (!this.isDragging_) this.bounds_ = options.bounds;
      }
      this.draw();
    }
  }
  return CustomMapOverlay;
}
