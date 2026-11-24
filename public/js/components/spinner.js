const spinner = {
    init: function () {
        this.spinnerCounter = 0;
        this.spinner = document.getElementById('spinner');
        this.counterDisplay = document.getElementById('counter');
        this.visibleDisplay = document.getElementById('visible');

    },

    startSpinner: function () {
        this.spinnerCounter++;

        if (this.spinnerCounter === 1) {
            this.spinner.classList.remove('hidden');
        }
    },

    stopSpinner: function () {
        if (this.spinnerCounter > 0) {
            this.spinnerCounter--;

            if (this.spinnerCounter === 0) {
                this.spinner.classList.add('hidden');
            }
        }
    },

    resetCounter: function () {
        this.spinnerCounter = 0;
        this.spinner.classList.add('hidden');
    }
}

export { spinner }