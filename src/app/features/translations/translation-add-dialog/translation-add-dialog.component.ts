import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import {TranslationValidator} from '../../../shared/validators/translation.validator';

@Component({
  selector: 'll-translation-add-dialog',
  templateUrl: './translation-add-dialog.component.html',
  styleUrls: ['./translation-add-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TranslationAddDialogComponent implements OnInit {
  readonly separatorKeysCodes: number[] = [ENTER, COMMA];
  translationTypes: string[] = ['STRING', 'PLURAL', 'ARRAY'];
  form: FormGroup = this.fb.group({
    id: this.fb.control('', TranslationValidator.ID),
    type: this.fb.control('STRING', TranslationValidator.TYPE),
    description: this.fb.control('', TranslationValidator.DESCRIPTION),
    value: this.fb.control('', TranslationValidator.STRING_VALUE),
    labels: this.fb.control([], TranslationValidator.DESCRIPTION)
  });

  constructor(private readonly fb: FormBuilder) {}

  ngOnInit(): void {}

  addLabel(event: MatChipInputEvent): void {
    const input = event.chipInput?.inputElement;
    const value: string = event.value;

    if ((value || '').trim()) {
      const labels: any = this.form.controls['labels'].value;
      if (labels instanceof Array) {
        labels.push(value);
      } else {
        this.form.controls['labels'].setValue([value]);
      }
    }
    // Reset the input value
    if (input) {
      input.value = '';
    }
  }

  removeLabel(label: string): void {
    const labels: any = this.form.controls['labels'].value;
    if (labels instanceof Array) {
      const index: number = labels.indexOf(label);
      labels.splice(index, 1);
    }
  }
}
