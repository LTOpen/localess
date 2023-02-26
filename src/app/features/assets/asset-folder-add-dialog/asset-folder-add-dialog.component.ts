import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';
import {FormBuilder, FormGroup} from '@angular/forms';
import {AssetFolderAddDialogModel} from './asset-folder-add-dialog.model';
import {FormErrorHandlerService} from '@core/error-handler/form-error-handler.service';
import {CommonValidator} from '@shared/validators/common.validator';
import {AssetValidator} from '@shared/validators/asset.validator';

@Component({
  selector: 'll-asset-folder-add-dialog',
  templateUrl: './asset-folder-add-dialog.component.html',
  styleUrls: ['./asset-folder-add-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AssetFolderAddDialogComponent {

  form: FormGroup = this.fb.group({
    name: this.fb.control('', [...AssetValidator.NAME, CommonValidator.reservedName(this.data.reservedNames)]),
  });

  constructor(
    private readonly fb: FormBuilder,
    readonly fe: FormErrorHandlerService,
    @Inject(MAT_DIALOG_DATA) public data: AssetFolderAddDialogModel
  ) {
  }
}
